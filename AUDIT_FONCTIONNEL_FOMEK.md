# Audit fonctionnel — SAS Transport Fomek

Date de l'audit : 7 août 2026  
Référence : `Cahier_des_charges_Transport_Fomek_a_signer.docx`

## Conclusion

L'application constitue une base avancée, mais **toutes les fonctionnalités demandées ne sont pas encore terminées**. La synchronisation serveur Fomek vers TRACKSEND est déployée et active. En revanche, plusieurs fonctions visibles proviennent encore d'Aaron Travel et ne doivent pas être considérées comme prêtes pour la production Fomek tant qu'elles n'ont pas été isolées et reconfigurées.

État global estimé : **partiellement fonctionnel**.

## Fonctionnalités disponibles

| Domaine | État | Observations |
|---|---:|---|
| Authentification des utilisateurs internes | ✅ | Firebase Authentication et profils Firestore opérationnels. |
| Rôles internes | 🟡 | Super administrateur, administrateur, responsable et personnel existent. Il n'existe pas encore de rôle dédié strictement au scan. |
| Tableau de bord | 🟡 | Indicateurs opérationnels et financiers présents, mais l'ensemble des filtres et exports du cahier doit être finalisé et testé avec des données réelles. |
| Demandes d'enlèvement | ✅ | Formulaire public, liste, validation/refus, photos et messages présents. |
| Dossiers d'enlèvement | ✅ | Création, modification, numéro de suivi, colis, contacts, paiement, documents et historique sont largement couverts. |
| Scan mobile des colis | ✅ | Lecture caméra/QR-barcode et traitement des colis disponibles. |
| Gestion des conteneurs | ✅ | Création, renommage, ajout par scan, colissage PDF, statut global, date de départ, estimation et statistiques financières disponibles. |
| Livraison finale | ✅ | Scan, nom et prénom du réceptionnaire, photo facultative de pièce d'identité, passage au statut livré et notification dans la cloche de l'administrateur sont présents. |
| Factures, devis et paiements manuels | 🟡 | Écrans de facturation et suivi des montants présents. Les parcours doivent encore être nettoyés des références Aaron Travel. |
| Tarifs et calculateur | ✅ | Interfaces disponibles. |
| Journal d'activité | ✅ | Collection et écran réservés au super administrateur. |
| TRACKSEND | 🟡 | La synchronisation serveur est active. L'entreprise Transport Fomek n'est pas encore proposée dans le sélecteur public du frontend TRACKSEND. |

## Fonctionnalités manquantes ou incomplètes

### Priorité critique avant utilisation client

1. **Supprimer les dépendances Aaron Travel des fonctions Fomek**
   - Plusieurs appels actifs utilisent encore le projet Cloud Functions `aarontravelgestion`.
   - Des SMS, PDF et messages contiennent encore « Aaron Travel » et des coordonnées Aaron.
   - Cela concerne notamment les détails d'enlèvement, les clients, le suivi client, le scan, le calculateur et plusieurs fonctions SMS.

2. **Finaliser l'intégration publique TRACKSEND**
   - Le tenant central `transport-fomek-app` et le slug `transport-fomek` existent.
   - La fonction Firestore de synchronisation est active dans le projet `fomektrack`.
   - Le frontend TRACKSEND ne propose actuellement que Paris Fret et Aaron Travel dans son sélecteur.
   - Les anciens colis ne sont synchronisés qu'après modification, sauf exécution d'un rattrapage initial.

3. **Sécuriser les écritures publiques Firestore**
   - `enlevements` autorise actuellement une création publique sans validation stricte (`allow create: if true`).
   - `pickupRequests` autorise également toute création publique sans liste stricte de champs.
   - Il faut valider les champs, limiter les tailles, ajouter App Check et une protection anti-abus côté serveur.

4. **Remplacer ou reconfigurer toutes les notifications**
   - Les notifications Fomek doivent utiliser les propres fonctions, secrets, expéditeurs et modèles de messages de Fomek.
   - Les secrets Twilio/routage ne doivent jamais être placés dans Vue ni dans une variable `VITE_*`.

### Fonctions demandées mais absentes

- **Espace personnel du client final** : absent. Le routeur refuse actuellement les comptes ayant le rôle `client`.
- **Export Excel** : absent. Les statistiques proposent actuellement du CSV, alors que le cahier demande PDF et Excel et exclut CSV.
- **Application installable/PWA** : absente. Aucun manifeste web ni service worker n'est configuré.
- **Affectation réelle d'un chauffeur à une demande** : à confirmer/finaliser ; les écrans de demandes gèrent validation et refus, mais le planning et l'espace chauffeur ont été explicitement exclus.

## Écarts avec les exclusions du cahier des charges

- Le paiement en ligne est confirmé hors périmètre ; seuls les paiements enregistrés manuellement sont attendus.
- Aucune signature manuscrite n'est demandée à la livraison : le nom et le prénom du réceptionnaire constituent la confirmation attendue.
- Des fichiers historiques de box/location restent dans le dépôt, bien que les box soient hors périmètre. Ils ne sont plus proposés dans la navigation active, mais alourdissent le projet.
- Des écrans historiques de chauffeurs et planning restent également présents sans être dans la navigation active.
- Une saisie manuelle/douchette USB existe dans le scan de livraison alors que le cahier exclut ce mode de secours.
- Des exports CSV existent alors que le cahier demande Excel et exclut CSV.

## Vérifications techniques effectuées

- Build de production Vue avec Node 20.19 : **réussi**.
- Tests du normaliseur TRACKSEND : **4 tests réussis sur 4**.
- Fonction `syncEnlevementToCentralTracking` : **déployée et active** sur Firebase `fomektrack`.
- Secret de l'API centrale : stocké dans Firebase Secrets, non exposé dans Vue ou Git.
- Taille du bundle principal : environ **2,46 Mo** avant compression ; optimisation recommandée.
- Aucun script de lint frontend n'est défini.
- Aucun test automatisé frontend n'est défini.
- Le runtime Node 20 des Cloud Functions devra être migré avant sa fin de support annoncée.

## Ordre recommandé pour terminer l'application

1. Isoler définitivement Fomek d'Aaron Travel et remplacer tous les textes, URLs, PDF et fonctions hérités.
2. Ajouter Transport Fomek au frontend TRACKSEND et tester un colis réel de bout en bout.
3. Corriger les règles Firestore publiques et activer App Check.
4. Reconfigurer puis tester les SMS Fomek : validation, départ, disponibilité, livraison et relance.
5. Créer le véritable espace client final.
6. Ajouter les exports Excel, puis retirer les exports CSV hors périmètre.
7. Transformer l'application en PWA installable.
8. Supprimer les modules historiques hors périmètre, ajouter lint et tests frontend, puis effectuer une recette métier complète.

## Statut de mise en production

La synchronisation TRACKSEND a été déployée. Cet audit n'a effectué aucun nouveau déploiement et n'a modifié aucune donnée métier. L'application Fomek ne doit pas encore être déclarée entièrement terminée tant que les points critiques ci-dessus ne sont pas corrigés et testés.
