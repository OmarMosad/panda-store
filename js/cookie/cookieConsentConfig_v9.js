import '/js/_lib/cookieconsent/cookieconsent-3.0.1.umd_v9.js';

CookieConsent.run({
    autoClearCookies: true,

    guiOptions: {
        consentModal: {
            layout: 'box wide',
            position: 'bottom center'
        },
        preferencesModal: {
            layout: 'box',
            equalWeightButtons: false,
            flipButtons: true
        }
    },

    categories: {
        necessary: {
            enabled: true,
            readOnly: true
        },
        analytics: {
            enabled: true,
        }
    },

    language: {
        default: 'en',
        autoDetect: 'document',
        translations: {
            en: '/js/cookie/translations/en.json',
            de: '/js/cookie/translations/de.json',
            it: '/js/cookie/translations/it.json',
            ru: '/js/cookie/translations/ru.json',
            fr: '/js/cookie/translations/fr.json',
            es: '/js/cookie/translations/es.json',
            ar: '/js/cookie/translations/ar.json',
        }
    }
})


