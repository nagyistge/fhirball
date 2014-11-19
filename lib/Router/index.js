var express = require('express');
var mongoose = require('mongoose');
var SchemaFactory = require('../SchemaFactory/index');
var ModelFactory = require('../ModelFactory/index');
var RouteFactory = require('../RouteFactory/index');
var async = require('async');
var bodyParser = require('body-parser');

DEFAULT_CONTENT_TYPE = 'application/json';

var Router = function (options) {
    if (!options.conformance) {
        throw new Error('conformance undefined');
    }

    options['content-type'] = options['content-type'] || DEFAULT_CONTENT_TYPE;

    var schemaFactory = new SchemaFactory();
    var modelFactory = new ModelFactory();
    var routeFactory = new RouteFactory(options['content-type']);
    var api = express.Router();
    var jsonParser = bodyParser.json({type: options['content-type']});

    function connectDb(callback) {
        try {
            mongoose.connect(options.db);
            callback();
        }
        catch (ex) {
            callback(ex);
        }
    }

    function decorateConformance(callback){
        try {
            options.conformance.acceptUnknown = true;
            options.conformance.format = ['json'];

            callback();
        }
        catch (ex){
            callback(ex);
        }
    }

    function addMetadataRoutes(callback) {
        try {
            api.get('/', routeFactory.makeConformance(options.conformance));
            api.get('/metadata', routeFactory.makeConformance(options.conformance));
            callback();
        }
        catch (ex) {
            callback(ex);
        }
    }

    function parseResource(resource, callback) {

        function decorateConformance(callback){
            try {
                resource.readHistory = false;
                resource.updateCreate = false;
                resource.searchInclude = false;

                resource.searchParam = resource.searchParam || [];

                callback();
            }
            catch(ex){
                callback(ex);
            }
        }

        function getResourceType(callback) {
            callback(null, resource.type);
        }

        function makeSchema(resourceType, callback) {
            schemaFactory.make(resourceType)
                .then(function (schema) {
                    callback(null, schema);
                })
                .catch(function (err) {
                    callback(err);
                });
        }

        function makeModel(schema, callback) {
            modelFactory.make(resource.type, schema)
                .then(function (model) {
                    callback(null, model);
                })
                .catch(function (err) {
                    callback(err);
                });
        }

        function parseOperation(model, callback) {
            async.map(resource.operation, function (operation, callback) {
                if (operation.code === 'search-type') {
                    var route = routeFactory.make(model, operation.code, resource.searchParam);

                    api.get('/' + resource.type, route);
                    api.get('/' + resource.type + '/_search', route);

                    routeFactory.ensureIndexes(model, resource.searchParam);
                }
                else {
                    var route = routeFactory.make(model, operation.code);
                    if (operation.code === 'read') {
                        api.get('/' + resource.type + '/:id/_tags', routeFactory.makeReadTagsForInstance(model));
                        api.get('/' + resource.type + '/:id', route);
                    }

                    if (operation.code === 'update') {
                        api.put('/' + resource.type + '/:id', jsonParser, route);
                    }

                    if (operation.code === 'delete') {
                        api.delete('/' + resource.type + '/:id', route);
                    }

                    if (operation.code === 'create') {
                        api.post('/' + resource.type + '/:id/_tags/_delete', jsonParser, routeFactory.makeDeleteTagsForInstance(model));
                        api.post('/' + resource.type + '/:id/_tags', jsonParser, routeFactory.makeCreateTagsForInstance(model));
                        api.post('/' + resource.type, jsonParser, route);
                    }
                }

                callback(null);
            }, callback);
        }

        async.waterfall([
            decorateConformance,
            getResourceType,
            makeSchema,
            makeModel,
            parseOperation
        ], callback);
    }

    function parseRest(rest, callback) {
        if (rest.mode === 'server') {
            async.map(rest.resource, parseResource, callback);
        }
    }

    function parseConformance(callback) {
        async.map(options.conformance.rest, parseRest, function (err) {
            if (err) return callback(err);
        });
        callback();
    }

    async.waterfall([
            connectDb,
            decorateConformance,
            addMetadataRoutes,
            parseConformance
        ],
        function (err) {
            if (err) throw(err);
        }
    );

    return api;
};

module.exports = exports = Router;