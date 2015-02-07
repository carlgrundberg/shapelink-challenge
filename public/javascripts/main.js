var user = localStorage.getItem("user");

function onError(jqXHR, textStatus, errorThrown) {
    var error = JSON.parse(jqXHR.responseText)
    console.log(error);
    $('#error-message').html(error.message).removeClass('hidden').scrollTo();
}

function scrollToSection(section) {
    $('html, body').animate({
        scrollTop: section.offset().top
    }, 1000);
}

function renderToplist(el, data) {
    var table = el.find('table').empty();
    for(var i in data) {
        table.append('<tr><td>'+data[i].pos+'</td><td>'+data[i].user.firstname + ' ' + data[i].user.lastname +'</td><td>'+data[i].reps+'</td></tr>');
    }
}

function getToplist() {
    var toplist = JSON.parse(localStorage.getItem('toplist'));
    var container = $('#toplist');
    if(toplist) {
        renderToplist(container, toplist);
    }
    $.ajax({
        url: '/toplist'
    }).done(function(data) {
        localStorage.setItem('toplist', JSON.stringify(data));
        renderToplist(container, data);
        container.find('.loading-overlay').hide();
    }).fail(onError);
}

function renderHistory(container, data) {
    if(data.reps == 0) {
        container.find('.title').html('You haven\'t done any burpees yet!');
    } else {
        container.find('.title').html('You have done <strong>' + data.reps + '</strong> burpees, keep on going!');
    }

    var progressBar = container.find('.progress-bar');
    var max = progressBar.attr('aria-valuemax');
    var remaining = max - data.reps;
    container.find('.remaining').html(remaining);
    container.find('.average').html(Math.round(remaining / parseInt(container.find('.days').html())));
    var width = Math.min(Math.round(data.reps / max * 100), 100) + '%';
    progressBar.attr('aria-valuenow', data.reps).css('width', width).html(width);
}

function getHistory() {
    var history = JSON.parse(localStorage.getItem('history'));
    var container = $('#result');
    if(history) {
        renderHistory(container, history);
    }
    $.ajax({
        url: '/history',
        data: {
            user_id: user.user_id,
            token: user.token
        }
    }).done(function(data) {
        localStorage.setItem('history', JSON.stringify(data));
        renderHistory(container, data);
        container.find('.loading-overlay').hide();
        scrollToSection(container);
    }).fail(onError);
}

function show() {
    $('#register').hide();
    $('#result, #toplist').removeClass('hidden');
    getHistory();
    getToplist();
}

if(user) {
    user = JSON.parse(user);
    show();
} else {
    $('#register-form').submit(function(e) {
        e.preventDefault();
        $.ajax({
            url: '/login',
            type: 'POST',
            data: $(this).serialize()
        }).done(function(data) {
            localStorage.setItem("user", JSON.stringify(data.result));
            user = data.result;
            show();
        }).fail(onError)
    });
    $('#register').removeClass('hidden');
}
