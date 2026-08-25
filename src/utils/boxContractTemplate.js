export const BOX_CONTRACT_TEMPLATE_DOC_PATH = ["settings", "boxContractTemplate"]

export const DEFAULT_BOX_CONTRACT_TEMPLATE = {
  enabled: true,
  title: "Contrat de mise à disposition d'un box de stockage",
  legalNotice:
    "Attention : Ce document est un modèle de contrat proposé à titre d'exemple. Il ne constitue pas un conseil juridique et doit être adapté à votre situation particulière. L'utilisateur est invité à consulter un professionnel du droit avant toute utilisation. Les dispositions ci-dessous tiennent compte des recommandations de la Commission des clauses abusives et de la réglementation française en vigueur.",
  provider: {
    name: "AARON TRAVEL SAS",
    address: "15 Rue des Écoles, 95500 LE THILLAY",
    registration: "RCS 828 534 214 000 14",
    representative: "CAMARA Aboubakar, dûment habilité",
  },
  sections: [
    {
      title: "1. Parties au contrat",
      paragraphs: [
        "Le prestataire : Dénomination sociale : {providerName} (ou la société exploitant le service de self-stockage). Siège social : {providerAddress}. Numéro d'immatriculation au RCS : {providerRegistration}. Représentée par : {providerRepresentative}.",
        "Le client : Nom : {clientName}. Adresse postale : {clientAddress}. Adresse électronique : {clientEmail}. Téléphone : {clientPhone}. Le cas échéant, société/forme juridique et numéro SIREN : {legalFormAndSiren}.",
        "Le prestataire et le client sont ci-après désignés collectivement les « Parties » et individuellement une « Partie ».",
      ],
    },
    {
      title: "2. Objet du contrat",
      paragraphs: [
        "Le présent contrat a pour objet de définir les conditions dans lesquelles le prestataire met à disposition du client un box de stockage privatif (ci-après le « Box ») situé dans les locaux du prestataire.",
        "Ce contrat constitue un contrat de location d'emplacement en libre-service et non un contrat de dépôt : le prestataire ne prend pas en garde les biens entreposés et n'a pas connaissance de leur contenu. Le client reste seul responsable de ses biens.",
      ],
    },
    {
      title: "3. Description du Box",
      paragraphs: [
        "Le Box mis à disposition est décrit dans les Conditions particulières, qui précisent notamment le numéro ou l'identification du Box, sa localisation au sein du site de stockage, ses dimensions approximatives, sa surface ou son volume exacts, ainsi que ses équipements.",
        "Référence du box : {boxCode}. Localisation : {boxLocation}. Surface : {boxSurface}. Hauteur : {boxHeight}. Volume : {boxVolume}.",
        "En cas d'erreur manifeste sur la surface ou le volume indiqué, les Parties conviennent de corriger l'erreur sans que cela remette en cause la validité du contrat.",
        "Le Box est remis en bon état d'usage ; un état des lieux d'entrée contradictoire peut être établi à la demande du prestataire ou du client.",
      ],
    },
    {
      title: "4. Durée du contrat",
      paragraphs: [
        "4.1 Durée initiale : Le contrat est conclu pour une durée initiale ferme choisie parmi les options suivantes : 1 mois, 3 mois, 6 mois, 9 mois ou 12 mois. La durée choisie est indiquée dans les Conditions particulières. Pour ce contrat : {durationChoice} mois, à compter du {startDate}, jusqu'au {endDate}.",
        "Durant cette période initiale, le contrat ne peut être résilié qu'aux conditions prévues à l'article 11.",
        "4.2 Tacite reconduction et notification : A l'expiration de la durée initiale, le contrat est tacitement reconduit pour des périodes successives d'une durée égale à la durée initiale, sauf dénonciation par l'une ou l'autre des Parties conformément à l'article 11.",
        "Conformément à l'article L.215-1 du Code de la consommation (loi Chatel), lorsque le client est un consommateur, le prestataire l'informe par écrit, au plus tôt trois mois et au plus tard un mois avant le terme de la période initiale, de la possibilité de ne pas reconduire le contrat.",
        "Lorsque le contrat a été conclu à distance ou hors établissement et que le client est consommateur, le prestataire permet la résiliation en ligne sans frais (article L.215-1-1 du Code de la consommation).",
      ],
    },
    {
      title: "5. Redevance et modalités de paiement",
      paragraphs: [
        "5.1 Montant : La redevance mensuelle HT et TTC est indiquée dans les Conditions particulières. Pour ce contrat : {monthlyHT} € HT, TVA {tvaRate} %, soit {monthlyTTC} € TTC. Le montant est payable à échoir, c'est-à-dire au début de chaque période mensuelle.",
        "5.2 Indexation : A chaque date anniversaire du contrat, le montant de la redevance peut être révisé selon la variation de l'Indice des loyers commerciaux (ILC) publié par l'INSEE.",
        "L'indice de référence est celui publié pour le trimestre civil connu à la date de signature, précisé le cas échéant en Conditions particulières.",
        "5.3 Dépôt de garantie : Le client verse, lors de la signature, un dépôt de garantie d'un montant de {depositTTC} € TTC. Ce dépôt garantit l'exécution de toutes les obligations contractuelles. Il est restitué dans un délai de trente jours après la restitution du Box et paiement de l'intégralité des sommes dues, déduction faite des éventuelles réparations ou sommes restant à acquitter.",
        "5.4 Modalités de règlement : Le paiement s'effectue par {paymentMethod}, ou tout autre moyen convenu dans les Conditions particulières.",
        "A défaut de règlement à l'échéance, des intérêts de retard sont dus de plein droit, calculés conformément à la réglementation applicable. Pour les clients professionnels, une indemnité forfaitaire de recouvrement de 40 € peut être due.",
        "En cas d'impayé persistant huit jours après un rappel, le prestataire adresse au client une mise en demeure. Si la situation n'est pas régularisée dans un délai de quinze jours, le prestataire pourra suspendre l'accès au Box à titre conservatoire et engager la procédure de résiliation prévue à l'article 11.",
      ],
    },
    {
      title: "6. Assurance",
      paragraphs: [
        "Le client s'engage à assurer les biens entreposés pour leur valeur réelle contre tous les risques, notamment incendie, dégât des eaux, vol et explosion. Il fournit au prestataire, lors de la signature et à chaque renouvellement, une attestation d'assurance valable pendant toute la durée du contrat.",
        "Assureur : {insuranceCompany}. Numéro de police : {insurancePolicy}. Attestation fournie le : {insuranceAttestationDate}.",
        "A défaut d'assurance ou de remise de l'attestation, le prestataire se réserve la faculté d'exiger la souscription immédiate d'une assurance adéquate, de suspendre l'accès au Box jusqu'à réception de l'attestation, de souscrire une assurance pour le compte du client et de lui refacturer le coût de la prime, ou de résilier le contrat selon les modalités de l'article 11.",
        "Le client est responsable des dommages qu'il pourrait causer aux installations, aux tiers ou aux autres locataires. Il garantit et indemnise le prestataire contre toute réclamation en raison du contenu stocké ou de l'usage du Box.",
      ],
    },
    {
      title: "7. Obligations du client",
      paragraphs: [
        "Le client s'engage à n'entreposer dans le Box que des biens licites, secs, non périssables et inodores, ne nécessitant aucun permis particulier.",
        "Sont notamment interdits : denrées alimentaires et produits périssables, animaux, plantes, substances explosives ou inflammables, matières dangereuses, corrosives, toxiques ou radioactives, armes ou munitions, produits interdits par la loi, objets à valeur patrimoniale exceptionnelle ou oeuvres d'art de grande valeur sans accord préalable.",
        "Le client s'engage à respecter les règles de sécurité du site, les horaires d'accès, les consignes d'évacuation, l'interdiction de fumer et le règlement intérieur affiché sur place.",
        "Il est interdit d'utiliser le Box comme adresse de domiciliation, local de vente, atelier de fabrication ou lieu d'habitation.",
        "Le client s'engage à maintenir le Box en bon état de propreté et à le restituer dans le même état qu'à son entrée, sous réserve de l'usure normale.",
        "Le client ne peut céder ou sous-louer le Box sans l'accord écrit du prestataire. Le contrat est conclu intuitu personae en considération de la personne du client.",
        "Le client informe immédiatement le prestataire de toute modification de ses coordonnées.",
        "Le client permet, en cas de péril imminent ou sur réquisition des autorités, l'accès au Box par le prestataire ou les services de secours, étant précisé que toute ouverture sans la présence du client fera l'objet d'un constat.",
      ],
    },
    {
      title: "8. Obligations du prestataire",
      paragraphs: [
        "Le prestataire s'engage à mettre à disposition un Box sécurisé et en bon état d'usage, conforme à la description figurant aux Conditions particulières.",
        "Le prestataire assure l'entretien des parties communes et la sécurité générale du site, notamment les accès, l'éclairage, la vidéosurveillance et les dispositifs de prévention incendie, conformément à la réglementation en vigueur.",
        "Le prestataire respecte la vie privée du client et ne pénètre pas dans le Box sauf cas d'urgence, suspicion de danger, incendie, dégât des eaux, présence de matières dangereuses ou injonction des autorités compétentes. Dans ces cas, le client est informé dans les meilleurs délais.",
      ],
    },
    {
      title: "9. Responsabilité",
      paragraphs: [
        "En sa qualité de loueur d'espace et non de dépositaire, le prestataire ne prend pas en charge la garde des biens entreposés. Sa responsabilité ne saurait être engagée en cas de perte, détérioration, vol ou destruction des biens, sauf faute prouvée de sa part.",
        "Le client demeure propriétaire exclusif des biens stockés et supporte seul les risques liés à leur entreposage. Il garantit le prestataire contre tout recours de tiers fondé sur la nature ou la propriété des biens.",
      ],
    },
    {
      title: "10. Accès au site et suspension",
      paragraphs: [
        "Le client peut accéder à son Box aux jours et heures d'ouverture indiqués dans le règlement intérieur. Un accès en dehors de ces horaires peut être autorisé à titre exceptionnel par le prestataire.",
        "En cas de non-respect des obligations contractuelles, notamment impayé après mise en demeure, stockage de biens interdits, trouble de voisinage ou danger pour les personnes ou les biens, le prestataire peut suspendre l'accès au Box par pose d'un second cadenas.",
        "Cette suspension est une mesure conservatoire ; elle n'entraîne pas la résiliation immédiate du contrat. Le prestataire informe le client des motifs de la suspension et l'invite à régulariser sa situation.",
      ],
    },
    {
      title: "11. Résiliation et fin de contrat",
      paragraphs: [
        "11.1 Résiliation à l'initiative du client : Le client peut résilier le contrat à l'issue de la durée initiale ou d'une période reconduite en respectant un préavis d'un mois notifié par lettre recommandée avec accusé de réception ou par e-mail avec accusé de réception.",
        "La résiliation prend effet à l'expiration de la période en cours, le client demeurant redevable de la redevance jusqu'au terme convenu.",
        "11.2 Résiliation à l'initiative du prestataire : Le prestataire peut résilier le contrat à l'expiration de toute période en respectant un préavis d'un mois notifié au client.",
        "Le prestataire peut également résilier le contrat de plein droit et sans indemnité en cas d'impayé persistant trente jours après mise en demeure restée infructueuse, en cas de violation grave ou répétée des obligations du client, ou en cas de force majeure rendant l'utilisation du Box impossible.",
        "La résiliation pour faute prend effet huit jours après notification au client. Le client doit alors libérer le Box et retirer ses biens dans un délai de quinze jours ; à défaut, il sera réputé avoir abandonné les biens. Le prestataire saisira le tribunal compétent pour être autorisé à en disposer conformément à la loi, les frais étant à la charge du client.",
        "11.3 Restitution du Box : A l'issue du contrat, le client restitue le Box dans l'état où il l'a reçu, vide et propre. Un état des lieux contradictoire est établi à la restitution pour déterminer d'éventuelles dégradations. Les frais de nettoyage ou de réparation nécessaires seront retenus sur le dépôt de garantie.",
      ],
    },
    {
      title: "12. Protection des données",
      paragraphs: [
        "Les données personnelles du client recueillies pour les besoins du présent contrat sont traitées par le prestataire conformément au Règlement général sur la protection des données (RGPD).",
        "Elles sont conservées pendant la durée du contrat et cinq ans après sa fin pour des raisons légales. Le client dispose d'un droit d'accès, de rectification, d'effacement, d'opposition, de limitation et de portabilité des données en s'adressant au prestataire.",
        "Le client peut également introduire une réclamation auprès de la CNIL.",
      ],
    },
    {
      title: "13. Médiation de la consommation",
      paragraphs: [
        "Conformément aux articles L.616-1 et R.616-1 du Code de la consommation, le prestataire a adhéré à un dispositif de médiation de la consommation.",
        "En cas de litige non résolu à l'amiable, le client consommateur peut saisir le médiateur compétent dont les coordonnées sont indiquées par le prestataire.",
        "Cette médiation est gratuite pour le consommateur.",
      ],
    },
    {
      title: "14. Droit applicable et juridiction compétente",
      paragraphs: [
        "Le présent contrat est régi par le droit français. Tout litige relatif à son interprétation ou à son exécution sera soumis aux tribunaux compétents du ressort du siège social du prestataire si le client est un professionnel.",
        "Si le client est un consommateur, il pourra saisir, à son choix, la juridiction du lieu de domicile du prestataire ou du sien.",
      ],
    },
    {
      title: "15. Dispositions finales",
      paragraphs: [
        "Nullité partielle : Si l'une quelconque des clauses du contrat est déclarée nulle ou réputée non écrite par une autorité judiciaire, les autres clauses conserveront leur plein effet.",
        "Modification du contrat : Aucune modification ne sera valable sans un écrit signé des deux Parties. Toute modification unilatérale par simple affichage ou publication est prohibée, conformément au Code de la consommation.",
        "Documents contractuels : Font partie intégrante du présent contrat les Conditions particulières signées, le règlement intérieur du site, les Conditions générales de vente, l'état des lieux et les éventuels avenants.",
        "Communication des documents : Le client reconnaît avoir reçu copie du présent contrat, des CGV et du règlement intérieur.",
        "Signature : Le contrat est établi en deux exemplaires originaux, un pour chaque Partie.",
      ],
    },
  ],
}

export function cloneDefaultBoxContractTemplate() {
  return JSON.parse(JSON.stringify(DEFAULT_BOX_CONTRACT_TEMPLATE))
}

export function normalizeBoxContractTemplate(template = {}) {
  const fallback = cloneDefaultBoxContractTemplate()
  const next = template && typeof template === "object" ? template : {}

  return {
    enabled: next.enabled !== false,
    title: String(next.title || fallback.title),
    legalNotice: String(next.legalNotice || fallback.legalNotice),
    provider: {
      ...fallback.provider,
      ...(next.provider && typeof next.provider === "object" ? next.provider : {}),
    },
    sections: Array.isArray(next.sections) && next.sections.length
      ? next.sections.map((section, index) => ({
          title: String(section?.title || `Clause ${index + 1}`),
          paragraphs: Array.isArray(section?.paragraphs)
            ? section.paragraphs.map((paragraph) => String(paragraph || "")).filter(Boolean)
            : [],
        }))
      : fallback.sections,
  }
}
