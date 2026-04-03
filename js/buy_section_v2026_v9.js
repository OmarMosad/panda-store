const BUY_SECTION_TEXT = {
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

function detectLang() {
    const classLang = (document.body && document.body.className || '').trim();
    if (BUY_SECTION_TEXT[classLang]) return classLang;

    const pathLang = (window.location.pathname.match(/^\/(ar|de|en|es|fr|it|ru)(\/|$)/i) || [])[1];
    if (pathLang && BUY_SECTION_TEXT[pathLang]) return pathLang;

    return 'en';
}

function getCurrentUser() {
    const telegramUserId = localStorage.getItem('telegram_user_id');
    const savedUsername = localStorage.getItem('telegram_username');
    let userObj = null;

    try {
        userObj = JSON.parse(localStorage.getItem('telegram_user') || 'null');
    } catch (_) {
        userObj = null;
    }

    const username = (userObj && userObj.username) || savedUsername || '';
    return {
        isLoggedIn: Boolean(telegramUserId),
        username: String(username || '').replace(/^@/, '').trim()
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

function ensureRecipientToolbar(lang, langText, currentUser) {
    const paymentForm = document.querySelector('.payment-form');
    const usernameInput = document.getElementById('username');
    if (!paymentForm || !usernameInput) return;

    if (document.getElementById('recipient_toolbar')) return;

    const toolbar = document.createElement('div');
    toolbar.id = 'recipient_toolbar';
    toolbar.className = 'recipient-toolbar';
    toolbar.innerHTML = `
        <div class="recipient-toolbar-title">${langText.chooseRecipient}</div>
        <button id="buy_for_myself_btn" type="button" class="buy-for-myself-btn">${langText.buyForMyself}</button>
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

function ensurePersonalAccountButton(lang, langText) {
    const introContent = document.querySelector('.profile_introducing-section .profile_introducing-content');
    const introBox = document.querySelector('.profile_introducing-section .box');
    if (!introBox || !introContent) return;

    const profileHref = `/${lang}/profile.html`;
    let accountBtn = document.getElementById('personal_account_btn');
    if (!accountBtn) {
        accountBtn = document.createElement('a');
        accountBtn.id = 'personal_account_btn';
        accountBtn.className = 'button button-personal-account';
    }
    accountBtn.textContent = langText.personalAccount;

    accountBtn.href = profileHref;

    let accountBox = document.getElementById('personal_account_box');
    if (!accountBox) {
        accountBox = document.createElement('div');
        accountBox.id = 'personal_account_box';
        accountBox.className = 'box';
    }

    let accountSpace = document.getElementById('personal_account_space');
    if (!accountSpace) {
        accountSpace = document.createElement('div');
        accountSpace.id = 'personal_account_space';
        accountSpace.className = 'space';
        accountSpace.innerHTML = `
            <span style="--i: 31" class="star"></span>
            <span style="--i: 12" class="star"></span>
            <span style="--i: 57" class="star"></span>
            <span style="--i: 93" class="star"></span>
            <span style="--i: 23" class="star"></span>
            <span style="--i: 70" class="star"></span>
            <span style="--i: 6" class="star"></span>
        `;
    }

    accountBox.innerHTML = '';
    accountBox.appendChild(accountBtn);
    accountBox.appendChild(accountSpace);

    let row = document.getElementById('personal_account_row');
    if (!row) {
        row = document.createElement('div');
        row.id = 'personal_account_row';
        row.className = 'personal-account-row';
    }

    row.innerHTML = '';
    row.appendChild(accountBox);

    if (introBox.parentNode === introContent) {
        introContent.insertBefore(row, introBox);
    } else {
        introContent.appendChild(row);
    }
}

$(async () => {
    const lang = detectLang();
    const langText = BUY_SECTION_TEXT[lang] || BUY_SECTION_TEXT.en;
    const currentUser = getCurrentUser();

    ensureRecipientToolbar(lang, langText, currentUser);
    ensurePersonalAccountButton(lang, langText);

    // Initialization complete.
});