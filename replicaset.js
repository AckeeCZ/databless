// Based on https://github.com/knex/knex/issues/2253#issuecomment-551610832

const Knex = require('knex');
const initKnex = require('./initKnex');

exports.createRoundRobinSelectionStrategy = () => {
    let round = {
        true: 0,
        false: 0,
    };
    return (pool, isWrite) => {
        const selected = pool[round[isWrite]];
        round[isWrite] = (round[isWrite] + 1) % (pool.length);
        return selected;
    };
};

exports.isWriteQuery = (query) => {
    return ['insert', 'del', 'update'].includes(query.method);
};

exports.isWriteBuilder = (builder) => {
    // Enable query context override: knex.select('*').queryContext({ replicaNode: 'write' | 'read' })
    if (builder._queryContext && 'replicaNode' in builder._queryContext) {
        return builder._queryContext === 'write';
    } 
    const sql = builder.toSQL();
    return Array.isArray(sql) ? sql.some(exports.isWriteQuery) : exports.isWriteQuery(sql);
}

/**
 * 
 * @param {Object} config
 * @param {Array<Knex.Config>} config.writeNodes List of knex configurations
 * for SQL master instances
 * @param {Array<Knex.Config>} config.readNodes List of knex configurations
 * for SQL read-only instances
 * @param {Knex.Config} config.proxy Knex configuration for "knex proxy"
 * used as a single knex handle that ultimately chooses one of the read/write
 * instances, based on given strategy.
 * @param {(pool: Array<Knex>, isWrite: bool) => Knex} config.select
 * @param {*} key Datables knex instance key.
 */
exports.initKnex = (config = { writeNodes: [], readNodes: [], proxy: {}, select: createRoundRobinSelectionStrategy() }, key = 'default') => {
    const createKnex = require('knex'); // eslint-disable-line global-require
    config.select = config.select || this.createRoundRobinSelectionStrategy();
    const writeNodes = config.writeNodes.map(createKnex);
    const readNodes = config.readNodes.map(createKnex);
    const replicaKnex = initKnex(config.proxy, key);
    replicaKnex.client.runner = function (builder) {
        const useWriteNode = exports.isWriteBuilder(builder);
        return config.select(useWriteNode ? writeNodes : readNodes, useWriteNode)
            .client.runner(builder);
    };
    replicaKnex.client.transaction = function (container, txConfig, outerTx) {
        return config.select(writeNodes, true)
            .client.transaction(container, txConfig, outerTx);
    };
    replicaKnex.client.destroy = () => {
        return Promise.all([
            ...writeNodes.map(node => node.client.destroy()),
            ...readNodes.map(node => node.client.destroy()),
        ]);
    };
    replicaKnex.client.config = writeNodes[0].client.config;
    replicaKnex.__rdbgwReplicaWriteNodes = writeNodes;
    replicaKnex.__rdbgwReplicaReadNodes = readNodes;
    return replicaKnex;
};

exports.writeReplicas = (knex) => knex.__rdbgwReplicaWriteNodes;
exports.readReplicas = (knex) => knex.__rdbgwReplicaReadNodes;
