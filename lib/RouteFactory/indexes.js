var indexFuncs = require('./indexFuncs');
var async = require('async');

exports.ensure = function(model, searchParam){
    searchParam
        .forEach(function(search){
        var indexes = indexFuncs.makeIndexes(search);

        async.eachSeries(indexes, function(index, callback){
                if (search.document.index) {
                    model.collection.ensureIndex(index, callback);
                }
                else {
                    model.collection.dropIndex(index, callback);
                }
            }
        );
    });
};