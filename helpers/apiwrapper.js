/**
 * Created by Carl on 2015-08-20.
 */
var q = require('q');
var _ = require('underscore');
var moment = require('moment');

exports.wrapper = (function() {
    function ApiWrapper(db, api, cacheTime, cachePeriod) {
        this.db = db;
        this.api = api;
        this.getCacheTime = function() {
            return moment().subtract(cacheTime, cachePeriod).toDate();
        }
    }

    ApiWrapper.prototype.get = function(dbQuery, apiArgs, apiToDb) {
        var deferred = q.defer();
        var self = this;
        this.db.findOne(_.extend(dbQuery, {expires: {$lte: new Date()}}), function(err, dbResult) {
            if (err) {
                deferred.reject(err);
                return;
            }
            if (!dbResult) {
                self.api.call(this, apiArgs).then(
                    function (apiResponse) {
                        var dbResult = apiToDb.call(this, apiResponse);
                        dbResult.expires = self.getCacheTime();
                        db.update(dbQuery, dbResult, {upsert: true});
                        deferred.resolve(dbResult);
                    },
                    deferred.reject
                );
            } else {
                deferred.resolve(dbResult);
            }
        });

        return deferred.promise;
    }
})();