# SMS Transport Fomek

Projet Firebase : `fomektrack`. Région : `us-central1`.

Les secrets `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` et `TWILIO_NUMBER` ont été copiés depuis `aarontravelgestion` dans Secret Manager le 16 septembre 2026. Le compte Twilio est partagé temporairement ; les consommations seront portées sur ce compte. Aucune valeur secrète ne doit être ajoutée au frontend.

Le code utilise `FOMEK` comme expéditeur SMS par défaut, configurable côté fonctions avec `TWILIO_SMS_SENDER_ID`. Le secret `TWILIO_NUMBER` est déclaré comme dépendance mais n'est pas utilisé pour l'expéditeur SMS actuel.

Le frontend utilise `VITE_FIREBASE_FUNCTIONS_BASE_URL=https://us-central1-fomektrack.cloudfunctions.net` pour les appels SMS. Les requêtes nécessitent le jeton Firebase de l'utilisateur Fomek dans l'en-tête Authorization.

WhatsApp n'est pas configuré ni déployé dans cette opération. Aucun message de test n'est envoyé.

Pour changer de compte : remplacer les trois secrets dans le projet fomektrack, vérifier l'expéditeur autorisé sur le nouveau compte, puis redéployer uniquement les fonctions SMS concernées. Ne pas modifier les secrets du projet Aaron Travel.

Fonctions SMS : sendInvoiceSMS, sendBroadcastSMS, sendContainerTrackingLinks, sendPickupTrackingLink, sendBoxTenantBroadcastSMS, sendDriverLinkSMS, sendInvoiceBySMS, sendInvoiceReminderSMS.
