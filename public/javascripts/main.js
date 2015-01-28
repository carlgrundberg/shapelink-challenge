
function onError(jqXHR, textStatus, errorThrown) {
    console.log(jqXHR.responseText);
}

function getHistory(user) {
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
            result.find('h1').html('You haven\'t done any burpees yet!');
        } else {
            result.find('h1').html('You have done <strong>' + data.result.totals.reps + '</strong> burpees, keep on going!');
        }
        var progressBar = result.find('.progress-bar');
        var max = progressBar.attr('aria-valuemax');
        progressBar.attr('aria-valuenow', data.result.totals.reps).css('min-width', '2em').html(Math.min(Math.round(data.result.totals.reps / max * 100), 100) + '%');
        result.show();
    }).fail(onError);
}

var user = localStorage.getItem("user");
if(user) {
    getHistory(JSON.parse(user));
} else {
    $('#register-form').submit(function(e) {
        e.preventDefault();
        $.ajax({
            url: '/login',
            type: 'POST',
            data: $(this).serialize()
        }).done(function(data) {
            localStorage.setItem("user", JSON.stringify(data.result));
            getHistory(data.result);
        }).fail(onError)
    });
    $('#register').show();
}
