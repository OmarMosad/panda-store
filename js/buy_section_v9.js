$(async () => {
    fetch(`${fetchUrl.purchase_form}?lang=${$('html').attr('lang')}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        }
    }).then(async response => {
        const result = await response.json();

        if (response.status != 200) {
            return
        }

        $('#form_wrapper').html(result.html)
    })
})