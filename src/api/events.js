import {useCollection, useFirestore} from "vuefire";
import {collection} from "firebase/firestore";
const db = useFirestore()
const datas = useCollection(collection(db, 'events'))

let eventGuid = 0

export const INITIAL_EVENTS = [
    {
        id: 2,
        title: 'All-day event',
        start: '2023-10-22'
    },
    {
        id: 3,
        title: 'Timed event',
        start: '2023-10-12'
    },
    {
        id: 4,
        title: 'Timed ',
        start: '2023-10-11'
    }
]

export function createEventId() {
    return String(eventGuid++)
}