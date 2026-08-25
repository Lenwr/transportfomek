// stores/enlevement.js
import { defineStore } from 'pinia';
import { db } from '../../components/firebaseConfig.js';
import {
    collection,
    getDocs,
    getDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    doc
} from 'firebase/firestore';

export const useBoxeStore = defineStore('boxes', {
    state: () => ({
        boxes: [],
        currentBoxe: null,
        loading: false,
        error: null
    }),

    actions: {
        // CREATE
        async createBoxes(data) {
            this.loading = true;
            try {
                const docRef = await addDoc(collection(db, 'boxes'), {
                    ...data,
                    createdAt: new Date(),
                    location : {
                        customer_id: "",
                        customer_name:"",
                        start_date: "",
                        end_date: ""
                    }
                });
                const newBoxe = { id: docRef.id, ...data };
                this.boxes.push(newBoxe);
                return newBoxe;
            } catch (error) {
                this.error = error.message;
                throw error;
            } finally {
                this.loading = false;
            }
        },

        // READ (tous les enlèvements)
        async fetchBoxes() {
            this.loading = true;
            try {
                const querySnapshot = await getDocs(collection(db, 'boxes'));
                this.boxes = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
            } catch (error) {
                this.error = error.message;
                throw error;
            } finally {
                this.loading = false;
            }
        },

        // READ (un seul enlèvement)
        async fetchBoxe(id) {
            this.loading = true;
            try {
                const docRef = doc(db, 'boxes', id);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    this.currentBoxe = {
                        id: docSnap.id,
                        ...docSnap.data()
                    };
                    return this.currentBoxe ;
                } else {
                    throw new Error('Boxe non trouvée');
                }
            } catch (error) {
                this.error = error.message;
                throw error;
            } finally {
                this.loading = false;
            }
        },

        // UPDATE
        async updateBoxes(id, updates) {
            this.loading = true;
            try {
                const docRef = doc(db, 'boxes', id);
                await updateDoc(docRef, updates);

                // Mise à jour du state local
                const index = this.boxes.findIndex(e => e.id === id);
                if (index !== -1) {
                    this.boxes[index] = {
                        ...this.boxes[index],
                        ...updates
                    };
                }
            } catch (error) {
                this.error = error.message;
                throw error;
            } finally {
                this.loading = false;
            }
        },

        // DELETE
        async deleteBoxe(id) {
            this.loading = true;
            try {
                await deleteDoc(doc(db, 'boxes', id));
                this.boxes = this.boxes.filter(e => e.id !== id);
            } catch (error) {
                this.error = error.message;
                throw error;
            } finally {
                this.loading = false;
            }
        }
    }
});
