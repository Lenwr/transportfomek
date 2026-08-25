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

export const useCustomersStore = defineStore('customers', {
    state: () => ({
        customers: [],
        currentCustomer: null,
        loading: false,
        error: null
    }),

    actions: {
        // CREATE
        async createCutomers(data) {
            this.loading = true;
            try {
                const docRef = await addDoc(collection(db, 'customers'), {
                    ...data,
                    createdAt: new Date()
                });
                const newCustomer = { id: docRef.id, ...data };
                this.customers.push(newCustomer);
                return newCustomer;
            } catch (error) {
                this.error = error.message;
                throw error;
            } finally {
                this.loading = false;
            }
        },

        // READ (tous les enlèvements)
        async fetchCustomers() {
            this.loading = true;
            try {
                const querySnapshot = await getDocs(collection(db, 'customers'));
                this.customers = querySnapshot.docs.map(doc => ({
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
        async fetchCustomer(id) {
            this.loading = true;
            try {
                const docRef = doc(db, 'customers', id);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    this.currentCustomer = {
                        id: docSnap.id,
                        ...docSnap.data()
                    };
                    return this.currentCustomer ;
                } else {
                    throw new Error('Client non trouvé');
                }
            } catch (error) {
                this.error = error.message;
                throw error;
            } finally {
                this.loading = false;
            }
        },

        // UPDATE
        async updateCustomers(id, updates) {
            this.loading = true;
            try {
                const docRef = doc(db, 'customers', id);
                await updateDoc(docRef, updates);

                // Mise à jour du state local
                const index = this.customers.findIndex(e => e.id === id);
                if (index !== -1) {
                    this.customers[index] = {
                        ...this.customers[index],
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
        async deleteCustomer(id) {
            this.loading = true;
            try {
                await deleteDoc(doc(db, 'customers', id));
                this.customers = this.customers.filter(e => e.id !== id);
            } catch (error) {
                this.error = error.message;
                throw error;
            } finally {
                this.loading = false;
            }
        }
    }
});
