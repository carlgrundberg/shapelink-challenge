var user = localStorage.getItem("user");
var users = {};

function onError(jqXHR, textStatus, errorThrown) {
    var error = JSON.parse(jqXHR.responseText)
    console.log(error);
    $('#error-message').html(error.message).removeClass('hidden').scrollTo();
}

function hideLoading(container) {
    container.find('.loading-overlay').hide();
}

function renderToplist(el, data) {
    var table = $('<table>');
    table.addClass('table table-striped');
    el.append(table);
    table.append('<tr><th>Pos</th><th>Name</th><th>Points</th></tr>tr>');
    var pos = 1;
    var lastresult = 0;
    for (var i in data) {
        var res = data[i];
        if (res.result == lastresult) {
            pos = i + 1;
        }
        if(!res.user && res.user_id) {
            res.user = users[res.user_id];
        }
        if(res.user) {
            table.append('<tr><td>' + pos + '</td><td>' + res.user.firstname + ' ' + res.user.lastname + '</td><td>' + Math.floor(res.result / 10) + '</td></tr>');
        }
        if(!users[res.user.id]) {
            users[res.user.id] = res.user;
        }
    }
}

function getTotals(cb) {
    var container = $('#totals');
    container.removeClass('hidden');
    return $.ajax({
        url: '/results'
    }).done(function (data) {
        renderToplist(container, data);
        hideLoading(container);
        cb();
    }).fail(onError);
}

function getPeriodResults(period) {
    var container = $('#' + period);
    var toplists = container.find('.toplists');
    container.removeClass('hidden');
    return $.ajax({
        url: '/results/' + period
    }).done(function (data) {
        for(var i = 0; i < data.length; i++) {
            var toplist = $('<div>');
            toplist.addClass('toplist');
            toplists.append(toplist);
            toplist.append('<h3 class="text-center">' + data[i].period + '</h3>');
            renderToplist(toplist, data[i].results);
        }
        toplists.slick({arrows: false, initialSlide: data.length -1, infinite: false});
        hideLoading(container);
    }).fail(onError);
}

function getChallenge() {
    return $.ajax({
        url: '/challenge',
        data: user
    }).done(function (data) {
        var $header = $('#header');
        $header.find('h2').html(data.title);
        $header.find('.updated-at').html(data.updated_at_formatted);
    }).fail(onError);
}

function show() {
    getChallenge();
    getTotals(function() {
        getPeriodResults('monthly');
        getPeriodResults('weekly');
    });
}

if (user) {
    user = JSON.parse(user);
    show();
} else {
    $('#register-form').submit(function (e) {
        e.preventDefault();
        $.ajax({
            url: '/login',
            type: 'POST',
            data: $(this).serialize()
        }).done(function (data) {
            localStorage.setItem("user", JSON.stringify(data.result));
            user = data.result;
            $('#register').hide();
            show();
        }).fail(onError)
    });
    $('#register').removeClass('hidden');
}
