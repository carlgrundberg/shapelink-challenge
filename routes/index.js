var express = require('express');
var router = express.Router();
var moment = require('moment');
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
/* GET home page. */
router.get('/', function (req, res, next) {
    res.render('index', {
        title: config.name,
        goal: config.goal,
        days: moment(config.endDate).diff(moment(), 'days')
    });
});

router.post('/login', function (req, res, next) {
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

    shapelink.diary().getStrengthExercises(req.query.token, function (data) {
        for (var i in data.result) {
            for (var j in data.result[i]) {
                var exercise = data.result[i][j];
                if (exercise.name.toLowerCase().indexOf(config.exercise) != -1) {
                    shapelink.statistics().getStrengthExerciseHistory(req.query.token, exercise.id, config.startDate, config.endDate, function (data) {
                        res.send(data);
                    }, function (err) {
                        res.status(400).send(err);
                    });
                    return;
                }
            }
        }
        // Exercise not found
        res.status(400).send({error: 'No exercise found'});
    }, function (err) {
        res.status(400).send(err);
    });
});

module.exports = router;
