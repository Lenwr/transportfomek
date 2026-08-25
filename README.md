# Application de gestion de fret — SAS Transport Fomek

Application indépendante créée pour SAS Transport Fomek. Elle ne partage ni projet Firebase, ni dépôt, ni secrets avec Aaron Travel.

## Périmètre fonctionnel

- tableau de bord et file des opérations à traiter ;
- demandes d’enlèvement et dossiers colis ;
- clients et espace client ;
- QR codes, codes-barres et scan avec la caméra du téléphone ;
- chargements conteneurs et listes de colissage ;
- statuts, historique, preuve de livraison et signature ;
- liens de suivi public via TRACKSEND ;
- factures, devis, paiements manuels, restes à payer et statistiques ;
- rôles SuperAdmin, responsable d’agence et équipe opérationnelle.

Ne sont pas inclus : Boxes, contrats de location, planning chauffeur, espace chauffeur et paiement en ligne.

## Identité et destinations

- Société : SAS Transport Fomek
- Directeur : Eric FOMEKONG — 07 66 81 37 07
- Service : 06 95 93 19 92 — saout.s@transportfomek.fr
- Adresse : 15 rue des Écoles, 95500 Le Thillay
- Destinations : Douala, Yaoundé et Kribi
- Fret : maritime et aérien

Le délai Cameroun n’est pas encore arrêté. Il doit être renseigné dans `company/profile.deliveryDelays` avant d’afficher une arrivée estimée :

```json
{
  "deliveryDelays": {
    "cameroun": 0,
    "douala": 0,
    "yaounde": 0,
    "kribi": 0
  }
}
```

Une valeur à `0` signifie « délai à confirmer ».

## Installation locale

Node.js 20.19 ou plus récent est recommandé.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Compléter `.env.local` avec le nouveau projet Firebase Fomek. Ne jamais commiter `.env.local`.

## Configuration Firebase

1. Créer un nouveau projet Firebase réservé à Transport Fomek.
2. Activer Authentication, Firestore, Storage et Cloud Functions.
3. Copier `.firebaserc` et remplacer `A_CONFIGURER_PROJET_FIREBASE_FOMEK` par l’identifiant du projet.
4. Ajouter les variables publiques Firebase dans `.env.local` et dans l’hébergeur.
5. Configurer les secrets serveur :

```bash
firebase functions:secrets:set TWILIO_ACCOUNT_SID
firebase functions:secrets:set TWILIO_AUTH_TOKEN
firebase functions:secrets:set TWILIO_NUMBER
firebase functions:secrets:set ADMIN_PHONES
firebase functions:secrets:set CENTRAL_TRACKING_API_URL
firebase functions:secrets:set CENTRAL_TRACKING_API_KEY
```

Configurer aussi côté Functions :

- `TRACKING_TENANT_ID=transport-fomek-app`
- `TRACKING_COMPANY_SLUG=transport-fomek`
- `TRACKING_COMPANY_NAME=SAS Transport Fomek`
- `ADMIN_APP_URL` avec l’URL finale de l’application.

La clé TRACKSEND reste exclusivement dans Firebase Secrets. Elle ne doit jamais être placée dans une variable `VITE_*`.

## Vérifications

```bash
npm run build
cd functions
npm install
npm test
```

## Déploiement

Le déploiement ne doit être exécuté qu’après validation du propriétaire et création du projet Firebase Fomek :

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage,functions
```

Puis publier le frontend sur Vercel avec les variables de `.env.example` renseignées. Aucun secret serveur ne doit être ajouté à Vercel sous un nom `VITE_*`.

## Points restant à fournir avant mise en production

- identifiant et configuration du nouveau projet Firebase ;
- URL de production de l’application de gestion ;
- délai maritime/aérien validé pour le Cameroun ;
- compte Twilio ou autre prestataire SMS ;
- tenant, company slug et clé API délivrés par TRACKSEND ;
- comptes initiaux des deux utilisateurs.

# transportfomek
