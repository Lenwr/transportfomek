<script setup>
import { ref, onMounted, watch } from "vue";
import JsBarcode from "jsbarcode";
import { jsPDF } from "jspdf";
import { Canvg } from 'canvg';

// ✅ Références pour les codes-barres
const barcodes = ref([
  "COLIS-" + Date.now(),
  "COLIS-" + (Date.now() + 1),
  "COLIS-" + (Date.now() + 2),
]);

// ✅ Fonction pour générer les codes-barres
const generateBarcodes = () => {
  barcodes.value.forEach((code, index) => {
    JsBarcode(`#barcode-${index}`, code, {
      format: "CODE128",
      displayValue: true,
      lineColor: "#000",
      width: 2,
      height: 60,
    });
  });
};

// ✅ Fonction pour convertir un SVG en image PNG
// Fonction pour convertir un SVG en PNG
const svgToImage = (svgElement) => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    // Utiliser Canvg pour dessiner le SVG sur le canvas
    Canvg.from(ctx, svgElement.outerHTML).then((v) => {
      v.start(); // Démarre le rendu SVG

      // Une fois rendu, convertir le canvas en image PNG
      canvas.toBlob((blob) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });
    });
  });
};

// Fonction p

// ✅ Générer le PDF avec les codes-barres
const generatePDF = async () => {
  const doc = new jsPDF('p', 'mm', 'a6'); // Format A6 (105mm x 148mm)
  
  // Paramètres d'espacement et positionnement des codes-barres
  let yPos = 10; // Position verticale de départ, ajustée pour tenir dans l'A6
  
  // Ajouter 3 codes-barres au PDF
  for (let index = 0; index < barcodes.value.length; index++) {
    const svgElement = document.querySelector(`#barcode-${index}`);
    
    // Convertir le SVG en image PNG
    const img = await svgToImage(svgElement);
    
    // Ajouter l'image (code-barres) au PDF
    const imageWidth = 80; // Largeur de l'image (95 mm pour s'ajuster à l'A6)
    const imageHeight = 20; // Hauteur de l'image (20 mm pour ne pas dépasser)

    doc.addImage(img, "PNG", 10, yPos, imageWidth, imageHeight); // x, y, largeur, hauteur (ajusté)

    // Ajouter le texte du code-barres en dessous
    doc.text(barcodes.value[index], 10, yPos + imageHeight + 5); // Ajuster le texte en dessous de l'image
    
    // Espacement pour le prochain code-barres
    yPos += imageHeight + 23; // Espacement de 15 mm entre les codes-barres
    if (yPos > 140) { // Si on atteint la fin de la page A6 (148mm), on passe à une nouvelle page
      doc.addPage();
      yPos = 10; // Réinitialiser la position verticale pour la nouvelle page
    }
  }

  // Sauvegarder et ouvrir le PDF
  doc.save("codes-barres.pdf");
};


// ✅ Génération automatique au chargement
onMounted(generateBarcodes);

// ✅ Mise à jour des codes-barres si la liste change
watch(barcodes, generateBarcodes);
</script>

<template>
  <div class="flex min-h-screen flex-col place-items-center overflow-x-hidden bg-slate-300 p-4 sm:p-5">
    <h2 class="text-lg font-bold text-black mb-4">Générateur de Codes-Barres</h2>

    <!-- ✅ Affichage des 3 codes-barres -->
    <div v-for="(code, index) in barcodes" :key="index" class="flex w-full justify-center">
      <svg class="w-full max-w-md" :id="'barcode-' + index"></svg>
    </div>

    <!-- ✅ Bouton pour générer 3 nouveaux codes-barres -->
    <button class="btn btn-primary mt-4" @click="barcodes = [
      'COLIS-' + Date.now(),
      'COLIS-' + (Date.now() + 1),
      'COLIS-' + (Date.now() + 2)
    ]">
      Générer 3 Nouveaux Codes
    </button>
      <!-- ✅ Bouton pour générer un PDF -->
      <button class="btn btn-primary mt-4" @click="generatePDF">
      Générer PDF pour Impression
    </button>
  </div>
</template>

<style scoped>

.btn {
  background: #4CAF50;
  color: white;
  padding: 10px 15px;
  border: none;
  cursor: pointer;
  border-radius: 5px;
}
.btn-primary {
  background: #007BFF;
}
</style>
