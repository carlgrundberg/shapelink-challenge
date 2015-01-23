var user = null;

$('#register-form').submit(function(e) {
    e.preventDefault();
    $.ajax({
        url: '/login',
        type: 'POST',
        data: $(this).serialize()
    }).done(function(data) {
        user = data.result;
        $.ajax({
            url: '/history/burpees',
            data: {
                token: user.token
            }
        });
    }).fail(function(jqXHR, textStatus, errorThrown) {
        console.log(jqXHR.responseText);
    })
});