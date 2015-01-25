
function onError(jqXHR, textStatus, errorThrown) {
    console.log(jqXHR.responseText);
}

function getHistory(user) {
    $.ajax({
        url: '/history',
        data: {
            token: user.token
        }
    }).done(function(data) {
        $('#register').hide();
        if(data.result.totals.reps == 0) {
            $('#result h1').html('You haven\'t done any burpees yet!');
        } else {
            $('#result h1').html('You have done <strong>' + data.result.totals.reps + '</strong> burpees, keep on going!');
        }
        $('#result .progress-bar').attr('aria-valuenow', data.result.totals.reps).css('min-width', '2em').html(Math.round(data.result.totals.reps / 1000 * 100) + '%');
        $('#result').show();
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
