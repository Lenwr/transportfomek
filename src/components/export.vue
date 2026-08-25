<template>
  <button class="btn bg-white" @click="exportToCsv">
    exporter
  </button>
</template>

<script setup>
const props = defineProps({
  dataSend: [],
});

const exportToCsv = () => {
  const data = props.dataSend
  const headers = Object.keys(data[0]);
  console.log(headers)


  const csvContent = convertToCsv(data)
  const blob = new Blob([csvContent],{type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download' , 'export.csv');
  link.click();
}

const convertToCsv = (data) => {
  const headers = Object.keys(data[0]);
  const rows = data.map(obj => headers.map(header => obj[header ]));
  const headerRow = headers.join(",");
  const csvRows = [headerRow, ...rows.map(row => row.join(","))];
  return csvRows.join('\n')
}
</script>


