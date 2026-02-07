$('.tm-more-options').on('click', () => {
    $('.payment-form').removeClass('options-collapsed')
    $('.payment-form').addClass('options-expanded')
})

$('.radio').on('click', function () {
    $('.quantity').html($(this).val())
    $('[name="packPrice"]').val($(this).closest('.tm-form-radio-item').find('.pack-price').html())
})

$('.js-form-clear, .js-quantity-clear').on('click', function () {
    const inputField = $(this).siblings('input')

    inputField.val('')
    inputField.css('border', '')

    if ($(this).hasClass('js-form-clear')) {
        $('.js-search-field-error').html('')
        $('.btn-buy').prop('disabled', true)
        $('.js-stars-search-photo').html('')
        $('.tm-search-field-photo').css('display', 'none')
        $('.js-stars-search-field').removeClass('found')
        $('[name="query"]').prop('disabled', false)
        $('.tm-search-error-icon').css('display', 'none')
    }

    if ($(this).hasClass('js-quantity-clear')) {
        $('.js-quantity-field-error').html('')
        $('.js-cur-price').html('')
        $('.js-discount-price').html('')
        $('[name="stars"][value="50"]').prop('checked', true)
        $('.quantity').html(50)
        $('[name="packPrice"]').val(0)
    }
})

let foundUser = false;
$('[name="query"]').on('blur', function () {
    $('.rocket-duck-sticker').css('display', 'block')
    $('.rocket-duck-sticker').css('animation', 'moveArc 3s cubic-bezier(0.25, 1, 0.5, 1) forwards')

    $(this).parent('div').addClass('loading play')

    const value = $(this).val()
    if (value.trim() === '') {
        $(this).parent('div').removeClass('loading play')

        foundUser = false

        $('.tm-search-error-icon').css('display', 'block')
        $('.btn-buy').prop('disabled', true)

        return
    }

    $('[name="tgUsername"]').val(value)

    fetch(`${fetchUrl.fg_get_user}?username=${value}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        }
    })
        .then(async response => {
            const result = await response.json()

            $(this).parent('div').removeClass('loading play')

            if (response.status != 200) {
                foundUser = false

                $('.tm-search-error-icon').css('display', 'block')
                $('.btn-buy').prop('disabled', true)
                $('.js-search-field-error').html(translation.bsf1)

                return
            }

            foundUser = true

            $('.js-stars-search-photo').html(result.found.photo)
            $('.tm-search-field-photo').css('display', 'block')
            $('.js-search-field-error').html('')
            $('.js-stars-search-field').addClass('found')
            $(this).val(result.found.name)
            $(this).prop('disabled', true)
            $('.btn-buy').prop('disabled', false)
            $('[name="query"]').css('border', '')
        })
        .catch((error) => console.error(error));
})

window.openPaymentServices = async () => {
    const tgUsername = $('[name="tgUsername"]').val();
    let quantity = $('.quantity').html();

    quantity = parseInt($('.quantity').html(), 10);
    quantity = isNaN(quantity) ? 0 : quantity;

    let packPrice = parseFloat($('[name="packPrice"]').val());

    Swal.fire({
        title: `${translation.bsf3}:`,
        showCloseButton: true,
        showConfirmButton: false,
        allowOutsideClick: false,
        didOpen: async () => {
            Swal.showLoading();
            Swal.update({
                title: `${translation.bsf3}:`,
                html: await gatewayList(tgUsername, quantity, packPrice),
                showCloseButton: true,
                showConfirmButton: false,
                allowOutsideClick: false,
            })
        }
    })
}

const gatewayList = async (tgUsername, quantity, packPrice) => {
    try {
        const response = await fetch(`${fetchUrl.available_gateway_list}?tgUsername=${tgUsername}&quantity=${quantity}&price=${packPrice}&lang=${$('html').attr('lang')}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const result = await response.json();

        return `${result.html}`;
    } catch (error) {
        return "<p>Failed to load payment gateways</p>";
    }
}

$('[name="query"]').blur(function () {
    if (foundUser == false) {
        $(this).css('border', '1px solid rgb(158, 23, 23)')
        $('.btn-buy').prop('disabled', true)

        return
    }

    $(this).css('border', '')
    $('.btn-buy').prop('disabled', false)
})

$('[name="quantity"]').blur(async function () {
    let value = $(this).val();
    $(this).parent('div').addClass('loading play')

    value = Number(value);

    if (0 != value && (50 > value || 10000 < value || !Number.isInteger(value))) {
        $(this).css('border', '1px solid rgb(158, 23, 23)');
        $('.js-quantity-field-error').html(translation.bsf2);
        $('.js-cur-price').html('');
        $('.js-discount-price').html('');
        $(this).parent('div').removeClass('loading play')

        return;
    }

    if (0 == value) {
        $('.js-cur-price').html('');
        $('.js-discount-price').html('');
        $('[name="stars"][value="50"]').prop('checked', true);
        $('.quantity').html(50);
        $(this).parent('div').removeClass('loading play')
        $('[name="packPrice"]').val(0)

        return;
    }

    $('[name="stars"]').prop('checked', false);
    $('.quantity').html(value);

    $(this).css('border', '');
    $('.js-quantity-field-error').html('');

    try {
        const response = await fetch(`${(fetchUrl.stars_price).replace('-quantity', parseInt(value, 10))}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error(`Server error! Status: ${response.status}`);
        }

        const data = await response.json();
        $(this).parent('div').removeClass('loading play')
        $('.js-cur-price').html(`${data.price}€`);
        $('.js-discount-price').html(`${data.discountPrice}€`);
        $('[name="packPrice"]').val($('.js-discount-price').length ? data.discountPrice : data.price)
    } catch (error) {
        console.error(error);
        $('.js-cur-price').html('Error retrieving price');
    }
});

$('.myself').on('click', function () {
    const myself = $('#myself').html();
    $(this).css('display', 'none');

    $('[name="query"]').val(myself).blur();
})