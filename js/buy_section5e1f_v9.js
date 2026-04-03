const BUY_PAGE_TEXT = {
    en: {
        chooseRecipient: 'Choose recipient',
        buyForMyself: 'Buy for myself',
        personalAccount: 'Personal Account'
    },
    ar: {
        chooseRecipient: 'اختر المستلم',
        buyForMyself: 'شراء لنفسي',
        personalAccount: 'الحساب الشخصي'
    },
    de: {
        chooseRecipient: 'Empfaenger waehlen',
        buyForMyself: 'Fuer mich kaufen',
        personalAccount: 'Persoenliches Konto'
    },
    es: {
        chooseRecipient: 'Elegir destinatario',
        buyForMyself: 'Comprar para mi',
        personalAccount: 'Cuenta personal'
    },
    fr: {
        chooseRecipient: 'Choisir le destinataire',
        buyForMyself: 'Acheter pour moi',
        personalAccount: 'Compte personnel'
    },
    it: {
        chooseRecipient: 'Scegli destinatario',
        buyForMyself: 'Compra per me',
        personalAccount: 'Account personale'
    },
    ru: {
        chooseRecipient: 'Выберите получателя',
        buyForMyself: 'Купить себе',
        personalAccount: 'Личный кабинет'
    }
};

function getPageLang() {
    const htmlLang = ((document.documentElement && document.documentElement.lang) || '').trim().toLowerCase();
    if (BUY_PAGE_TEXT[htmlLang]) return htmlLang;

    const pathLang = (window.location.pathname.match(/^\/(ar|de|en|es|fr|it|ru)(\/|$)/i) || [])[1];
    if (pathLang && BUY_PAGE_TEXT[pathLang]) return pathLang;

    return 'en';
}

function getCurrentUserData() {
    const telegramUserId = localStorage.getItem('telegram_user_id');
    const savedUsername = localStorage.getItem('telegram_username');

    let userObj = null;
    try {
        userObj = JSON.parse(localStorage.getItem('telegram_user') || 'null');
    } catch (_) {
        userObj = null;
    }

    return {
        isLoggedIn: Boolean(telegramUserId),
        username: String((userObj && userObj.username) || savedUsername || '').replace(/^@/, '').trim()
    };
}

function fillRecipientAndTriggerLookup(usernameInput, username) {
    const cleanUsername = String(username || '').replace(/^@+/, '').trim();
    if (!cleanUsername) return;

    const formattedUsername = `@${cleanUsername}`;

    usernameInput.disabled = false;
    usernameInput.value = formattedUsername;
    usernameInput.setAttribute('data-username', cleanUsername);
    usernameInput.style.border = '';

    const queryInput = document.querySelector('[name="query"]');
    if (queryInput) {
        queryInput.disabled = false;
        queryInput.value = formattedUsername;
        queryInput.style.border = '';
    }

    const tgUsernameInput = document.querySelector('[name="tgUsername"]');
    if (tgUsernameInput) {
        tgUsernameInput.value = cleanUsername;
    }

    $('.js-stars-search-field').removeClass('found error');
    $('.js-search-field-error').html('');
    $('.js-stars-search-photo').html('');
    $('.tm-search-field-photo').css('display', 'none');
    $('.tm-search-error-icon').css('display', 'none');
    $('.btn-buy').prop('disabled', true);

    usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
    usernameInput.dispatchEvent(new Event('change', { bubbles: true }));
    usernameInput.dispatchEvent(new Event('blur', { bubbles: true }));
    usernameInput.focus();
}

function injectRecipientActions() {
    const usernameInput = document.getElementById('username');
    const paymentForm = document.querySelector('.payment-form');
    if (!usernameInput || !paymentForm) return;
    if (document.getElementById('recipient_toolbar')) return;

    const lang = getPageLang();
    const text = BUY_PAGE_TEXT[lang] || BUY_PAGE_TEXT.en;
    const currentUser = getCurrentUserData();

    const toolbar = document.createElement('div');
    toolbar.id = 'recipient_toolbar';
    toolbar.className = 'recipient-toolbar';

    const profileHref = `/${lang}/profile.html`;
    toolbar.innerHTML = `
        <div class="recipient-toolbar-title">${text.chooseRecipient}</div>
        <div class="recipient-toolbar-actions">
            <a href="${profileHref}" class="recipient-personal-account-btn">${text.personalAccount}</a>
            <button id="buy_for_myself_btn" type="button" class="buy-for-myself-btn">${text.buyForMyself}</button>
        </div>
    `;

    paymentForm.insertBefore(toolbar, paymentForm.firstElementChild);

    const buyForMyselfBtn = document.getElementById('buy_for_myself_btn');
    buyForMyselfBtn.addEventListener('click', () => {
        if (!currentUser.isLoggedIn || !currentUser.username) {
            window.location.href = `/${lang}/login.html`;
            return;
        }

        fillRecipientAndTriggerLookup(usernameInput, currentUser.username);
    });
}

$(async () => {
    fetch(`${fetchUrl.purchase_form}?lang=${$('html').attr('lang')}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        }
    }).then(async response => {
        const result = await response.json();

        if (response.status != 200) {
            injectRecipientActions();
            return;
        }

        $('#form_wrapper').html(result.html);
        injectRecipientActions();
    }).catch(() => {
        injectRecipientActions();
    });

    // Fallback for any delayed HTML rendering
    setTimeout(injectRecipientActions, 400);
});