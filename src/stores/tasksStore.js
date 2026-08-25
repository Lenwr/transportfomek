import {defineStore} from "pinia";


export const useTasksStore =  defineStore('tasksStore',{
    state:()=>({
        tasks:[
            {id : 1 , text : '2 cartons à ramasser' , status: true, adresse:''},
            {id : 2 , text : '2 cartons à ramasser' , status: false ,  adresse:''}
        ],
        date : "15 Aout 2024",
        title: "Trajets du jour"
    }),
    getters:{
        done() {
            return this.tasks.filter(t=>t.status)
        },
        doneCount(){
            return this.tasks.reduce((p ,c)=>{
                    return c.status ? p+1 : p
            },0 )
        },
        totalCount(state){
            return state.tasks.length
        }
    },
    actions:{
        addTask(task){
            this.tasks.push(task)
        }
    }
})
