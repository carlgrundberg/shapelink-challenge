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
    el.find('h2').html(data.label);
    var table = el.find('table').empty();
    table.append('<tr><th>Pos</th><th>Name</th><th>Points</th></tr>tr>');
    for(var i in data.results) {
        var res = data.results[i];
        table.append('<tr><td>'+res.pos+'</td><td>'+res.user.firstname + ' ' + res.user.lastname +'</td><td>'+res.total+'</td></tr>');
    }
}

function getToplist(toplist) {
    console.log('get toplist', toplist);
    var list = JSON.parse(localStorage.getItem(toplist));
    var container = $('.toplist.' + toplist);
    if (list) {
        renderToplist(container, list);
    }
    return $.ajax({
        url: '/history/' + toplist,
        data: {
            token: user.token
        }
    }).done(function (data) {
        localStorage.setItem(toplist, JSON.stringify(data));
        renderToplist(container, data);
        console.log('got toplist', toplist);
        container.find('.loading-overlay').hide();
    }).fail(onError);

}

function getChallenge() {
    return $.ajax({
        url: '/challenge',
        data: user
    }).done(function(data) {
        var $header = $('#header');
        $header.find('h2').html(data.title);
        $header.find('.updated-at').html(data.updated_at_formatted);
    }).fail(onError);
}

function show() {
    $('#register').hide();
    $('.toplist').removeClass('hidden');
    getChallenge().done(function() {
        var d = $.Deferred().resolve();
        ['totals', 'monthly', 'weekly'].forEach(function(toplist) {
            d = d.then(function() {
               return getToplist(toplist);
            });
        });
    });
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
