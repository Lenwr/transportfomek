import {defineStore} from 'pinia'

export const useDailyTasksStore = defineStore('todoList',{
//state
    state: () => ({
        todoList : [],
        id: 0
   }),
 
   //getters
    getters : {
    },
    //actions
    actions : {
      addTodo(item){
        this.todoList.push({item, id: this.id++ , completed: false})
      },
      deleteTodo(itemId){
        this.todoList = this.todoList.filter((object)=>{
            return object.id !== itemId
        })
      },
      toggleCompleted(idToFind){
        const todo = this.todoList.find((obj)=>obj.id === idToFind)
        if(todo){
          todo.completed = !todo.completed
        }
      }
    }

})