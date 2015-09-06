var q = require('q');
var moment = require('moment');
var _ = require('underscore');
var config;
try {
    config = require('../config.json')
} catch (err) {
    config = {}
}
config = _.extend(config, {
    challenge: 62937,
    startDate: "2015-07-01",
    endDate: "2015-12-31"
});

var Shapelink = require('shapelink').Shapelink;
var shapelink = new Shapelink(process.env.SHAPELINK_KEY || config.shapelink.apiKey, process.env.SHAPELINK_SECRET || config.shapelink.secret, 'sv', {}, true);
var RateLimiter = require('limiter').RateLimiter;
var limiter = new RateLimiter(10, 'second');

var db = require('mongojs')(process.env.MONGOLAB_URI || 'localhost/shapelink-challenge', ['users', 'results', 'challenges']);
db.users.createIndex({'token': 1}, {unique: true});

function errorHandler(err) {
    console.dir(err);
}

function getDayResultForUser(user, date) {
    var deferred = q.defer();

    limiter.removeTokens(1, function (err, remaining) {
        if(err) {
            deferred.reject(err);
            return;
        }
        shapelink.diary.getDay({user_token: user.token, date: date}).then(
            function (data) {
                var total = 0;
                for (var i = 0; i < data.result.done_workouts.length; i++) {
                    var workout = data.result.done_workouts[i];
                    total += workout.kcal;
                }
                var r = {
                    user_token: user.token,
                    date: date,
                    result: total,
                    updated_at: new Date()
                };
                db.results.update({user_token: user.token, date: r.date}, r, {upsert: true}, function(err) {
                    if(err) {
                        deferred.reject(err);
                    } else {
                        deferred.resolve(r);
                    }
                });

            },
            deferred.reject
        );
    });

    return deferred.promise;
}

function getResultForUser(participant, startDate, endDate) {
    var deferred = q.defer();
    var p = [];
    var now = moment();
    db.users.findOne({username: participant.user.username}, function (err, user) {
        if (err | !user) {
            deferred.reject(err);
            return;
        }

        for (var d = moment(startDate); d.isBefore(endDate) && d.isBefore(now); d = d.add(1, 'days')) {
            var date = d.format('YYYY-MM-DD');
            p.push(getDayResultForUser(user, date));
        }

        q.allSettled(p).done(deferred.resolve);
    });

    return deferred.promise;
}

function getChallenge() {
    var deferred = q.defer();

    shapelink.challenge.getChallenge({user_token: config.shapelink.token, challenge_id: config.challenge}).then(
        function (data) {
            var challenge = _.extend(data.result, {updated_at: new Date(), challenge_id: data.result.id});
            delete challenge.id;
            db.challenges.update({challenge_id: config.challenge}, challenge, {upsert: true}, function(err) {
                if(err) {
                    deferred.reject(err);
                } else {
                    deferred.resolve(challenge);
                }
            });
        },
        deferred.reject
    );

    return deferred.promise;
}


function getResultsForChallenge(challenge) {
    var startDate = moment(config.startDate);
    var endDate = moment(config.endDate);

    var deferred = q.defer();
    var p = [];
    for (var i in challenge.results.data) {
        var participant = challenge.results.data[i];
        p.push(getResultForUser(participant, startDate, endDate));
    }
    if (p.length > 0) {
        q.allSettled(p).done(deferred.resolve, deferred.reject);
    } else {
        deferred.resolve();
    }
    return deferred.promise;
}

var start = new Date();

getChallenge(config.challenge).then(function (challenge) {
    getResultsForChallenge(challenge).then(function () {
        console.log('All done in ' + moment().diff(start, 'seconds') + ' seconds.');
        process.exit();
    }, errorHandler);
}, errorHandler);