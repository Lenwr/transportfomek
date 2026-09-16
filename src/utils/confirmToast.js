import { defineComponent, h, onUnmounted } from 'vue'
import { toast } from 'vue3-toastify'
import 'vue3-toastify/dist/index.css'

// Closing the notification is always a cancellation, never an approval.
export function confirmToast(message) {
  return new Promise(resolve => {
    let settled = false
    let toastId
    const settle = result => {
      if (settled) return
      settled = true
      resolve(result)
    }
    const finish = result => {
      settle(result)
      toast.remove(toastId)
    }
    const Content = defineComponent({
      setup() {
        onUnmounted(() => settle(false))
        return () => h('div', { style: 'width:100%;color:#0f172a' }, [
          h('p', { style: 'margin:0 0 12px;white-space:pre-line;font-weight:600' }, String(message)),
          h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, [
            h('button', {
              type: 'button',
              style: 'padding:8px 14px;border:1px solid #cbd5e1;border-radius:8px;background:white;color:#0f172a;cursor:pointer',
              onClick: () => finish(false)
            }, 'Annuler'),
            h('button', {
              type: 'button',
              style: 'padding:8px 14px;border:0;border-radius:8px;background:#155e75;color:white;font-weight:700;cursor:pointer',
              onClick: () => finish(true)
            }, 'Confirmer')
          ])
        ])
      }
    })
    toastId = toast(Content, {
      position: 'top-center',
      type: 'default',
      theme: 'light',
      autoClose: false,
      closeOnClick: false,
      closeButton: true,
      draggable: false,
      hideProgressBar: true,
      onClose: () => settle(false)
    })
  })
}
