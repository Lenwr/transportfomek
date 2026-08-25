import { defineStore } from 'pinia';
import {useCollection, useFirestore} from "vuefire";
const db = useFirestore()
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

export const useEnlevementStore = defineStore('enlevements', {
    state: () => ({
        enlevements: [],
        currentEnlevement: null,
        loading: false,
        error: null,
        filters: {
            date: null,
            search: ''
        }
    }),

    getters: {
        filteredEnlevements: (state) => {
            let result = [...state.enlevements];

            if (state.filters.search) {
                const searchLower = state.filters.search.toLowerCase();
                result = result.filter(e =>
                    e.nomExpediteur.toLowerCase().includes(searchLower) ||
                    e.nomDestinataire.toLowerCase().includes(searchLower)
                );
            }

            if (state.filters.date) {
                result = result.filter(e =>
                    new Date(e.date).toDateString() === new Date(state.filters.date).toDateString()
                );
            }

            return result;
        }
    },

    actions: {
        async fetchEnlevements() {
            this.loading = true;
            try {
                const querySnapshot = await getDocs(collection(db, 'enlevements'));
                this.enlevements = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
            } catch (error) {
                this.error = error.message;
            } finally {
                this.loading = false;
            }
        },

        async addEnlevement(enlevementData) {
            const { colis, date, nomExpediteur, nomDestinataire } = enlevementData;
            try {
                const docRef = await addDoc(collection(db, 'enlevements'), {
                    colis,
                    date,
                    nomExpediteur,
                    nomDestinataire,
                    createdAt: new Date()
                });
                this.enlevements.push({
                    id: docRef.id,
                    ...enlevementData
                });
                return docRef.id;
            } catch (error) {
                this.error = error.message;
                throw error;
            }
        },

        async updateEnlevement(id, updates) {
            try {
                await updateDoc(doc(db, 'enlevements', id), updates);
                const index = this.enlevements.findIndex(e => e.id === id);
                if (index !== -1) {
                    this.enlevements[index] = {
                        ...this.enlevements[index],
                        ...updates
                    };
                }
            } catch (error) {
                this.error = error.message;
                throw error;
            }
        },

        async deleteEnlevement(id) {
            try {
                await deleteDoc(doc(db, 'enlevements', id));
                this.enlevements = this.enlevements.filter(e => e.id !== id);
            } catch (error) {
                this.error = error.message;
                throw error;
            }
        }
    }
});


