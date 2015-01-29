var user = localStorage.getItem("user");

function onError(jqXHR, textStatus, errorThrown) {
    var error = JSON.parse(jqXHR.responseText)
    console.log(error);
    $('#error-message').html(error.message).removeClass('hidden').scrollTo();
}

function showSection(section, scrollTo) {
    $(section).show();
    if(scrollTo) {
        $('html, body').animate({
            scrollTop: section.offset().top
        }, 1000);
    }
}

function getToplist() {
    $.ajax({
        url: '/toplist'
    }).done(function(data) {
        var toplist = $('#toplist');
        var table = toplist.find('table');
        for(var i in data) {
            table.append('<tr><td>'+data[i].user_id+'</td><td>'+data[i].result.totals.reps+'</td></tr>');
        }
        toplist.show();
    }).fail(onError);
}

function getHistory() {
    $.ajax({
        url: '/history',
        data: {
            user_id: user.user_id,
            token: user.token
        }
    }).done(function(data) {
        $('#register').hide();
        var result = $('#result');
        if(data.result.totals.reps == 0) {
            result.find('.title').html('You haven\'t done any burpees yet!');
        } else {
            result.find('.title').html('You have done <strong>' + data.result.totals.reps + '</strong> burpees, keep on going!');
        }

        var progressBar = result.find('.progress-bar');
        var max = progressBar.attr('aria-valuemax');
        var remaining = max - data.result.totals.reps;
        result.find('.remaining').html(remaining);
        result.find('.average').html(Math.round(remaining / parseInt(result.find('.days').html())));
        progressBar.attr('aria-valuenow', data.result.totals.reps).css('min-width', '2em').html(Math.min(Math.round(data.result.totals.reps / max * 100), 100) + '%');
        showSection(result, true);
    }).fail(onError);
}

if(user) {
    user = JSON.parse(user);
    getHistory();
    getToplist();
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
            getHistory();
        }).fail(onError)
    });
    $('#register').show();
}
