var q = require('q');
var express = require('express');
var moment = require('moment');
var router = express.Router();
var config = require('../config.json');

var Shapelink = require('../../shapelink-node-sdk').Shapelink;
var shapelink = new Shapelink(config.shapelink.apiKey, config.shapelink.secret, 'sv', true);

var storage = require('node-persist');
storage.initSync({
    dir: __dirname + '/../db'
});

var users = storage.getItemSync('users') || {};


function storeUser(user) {
    users[user.user_id] = user;
    storage.setItem('users', users);
}

function getResultForUser(user) {
    var deferred = q.defer();
    shapelink.diary().getStrengthExercises(user.token, function (data) {
        for (var i in data.result) {
            for (var j in data.result[i]) {
                var exercise = data.result[i][j];
                if (exercise.name.toLowerCase().indexOf(config.exercise) != -1) {
                    shapelink.statistics().getStrengthExerciseHistory(user.token, exercise.id, config.startDate, config.endDate, function (data) {
                        data.user_id = user.user_id;
                        deferred.resolve(data);
                    }, function (err) {
                        deferred.reject(err);
                    });
                    return;
                }
            }
        }
        // Exercise not found
        deferred.reject({error: 101, message: 'No exercise found'});
    }, function (err) {
        deferred.reject(err);
    });
    return deferred.promise;
}
/* GET home page. */
router.get('/', function (req, res) {
    res.render('index', {
        title: config.name,
        goal: config.goal,
        days: moment(config.endDate).diff(moment(), 'days')
    });
});

router.post('/login', function (req, res) {
    shapelink.auth().requireToken(req.body.username, req.body.password, function (data) {
        storeUser(data.result);
        res.send(data);
    }, function (err) {
        res.status(400).send(err);
    });
});

router.get('/history', function (req, res, next) {
    if (!users[req.query.user_id]) {
        storeUser({
            user_id: req.query.user_id,
            token: req.query.token
        });
    }

    var user = users[req.query.user_id];

    getResultForUser(user).then(function(data) {
        res.send(data);
    }).catch(next);
});

router.get('/toplist', function(req, res, next) {
    var p = [];
    for(var user_id in users) {
        p.push(getResultForUser(users[user_id]));
    }
    q.allSettled(p).done(function(results) {
        var r = [];
        for(var i in results) {
            if(results[i].state == 'fulfilled') {
                var result = results[i].value;
                r.push(result)
            }
        }
        res.send(r);
    }, function(err) {
        console.log(err);
        if (err.error != 101) {
            next(err);
        }
    });
});

module.exports = router;
