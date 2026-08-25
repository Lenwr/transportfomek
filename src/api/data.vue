<script >
import { useCollection, useFirestore } from 'vuefire';
import { collection } from 'firebase/firestore';

const db = useFirestore();
const data = useCollection(collection(db, 'enlevements'));
export { data };
</script>
