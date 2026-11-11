<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
    <header class="mb-8 flex flex-wrap justify-between items-center gap-4">
      <div>
        <h1 class="text-3xl font-bold text-blue-600">CloudLaundry.</h1>
        <p class="text-sm text-gray-500 mt-1">Secure Laundry Management Dashboard</p>
        <p class="text-sm text-gray-500">DevSecOps CI/CD Demonstration</p>
      </div>
      <div v-if="user" class="flex items-center gap-3">
        <div class="text-right">
          <p class="text-sm font-semibold">{{ user.name }}</p>
          <p class="text-xs text-gray-500">{{ user.email }} · {{ user.role }}</p>
        </div>
        <button @click="logout" class="bg-red-100 text-red-700 px-4 py-2 rounded-md text-sm font-semibold">Logout</button>
      </div>
    </header>

    <section v-if="!user" class="max-w-md mx-auto bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <div class="flex gap-2 mb-6">
        <button @click="authMode='login'" :class="authMode==='login' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'" class="flex-1 px-4 py-2 rounded-md font-semibold">Login</button>
        <button @click="authMode='register'" :class="authMode==='register' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'" class="flex-1 px-4 py-2 rounded-md font-semibold">Daftar Customer</button>
      </div>

      <form v-if="authMode==='login'" @submit.prevent="login" class="space-y-4">
        <h2 class="text-xl font-semibold">Masuk ke CloudLaundry</h2>
        <div>
          <label class="block text-sm font-medium">Email</label>
          <input v-model.trim="authForm.email" type="email" autocomplete="username" required class="mt-1 w-full rounded-md border p-2">
        </div>
        <div>
          <label class="block text-sm font-medium">Password</label>
          <input v-model="authForm.password" type="password" autocomplete="current-password" required class="mt-1 w-full rounded-md border p-2">
        </div>
        <button :disabled="busy" class="w-full bg-blue-600 text-white px-4 py-2 rounded-md font-semibold disabled:opacity-50">
          {{ busy ? 'Memproses...' : 'Login' }}
        </button>
      </form>

      <form v-else @submit.prevent="register" class="space-y-4">
        <h2 class="text-xl font-semibold">Registrasi Customer</h2>
        <div>
          <label class="block text-sm font-medium">Nama</label>
          <input v-model.trim="registerForm.name" type="text" maxlength="100" autocomplete="name" required class="mt-1 w-full rounded-md border p-2">
        </div>
        <div>
          <label class="block text-sm font-medium">Email</label>
          <input v-model.trim="registerForm.email" type="email" autocomplete="email" required class="mt-1 w-full rounded-md border p-2">
        </div>
        <div>
          <label class="block text-sm font-medium">Password (minimal 12 karakter)</label>
          <input v-model="registerForm.password" type="password" minlength="12" maxlength="72" autocomplete="new-password" required class="mt-1 w-full rounded-md border p-2">
        </div>
        <button :disabled="busy" class="w-full bg-blue-600 text-white px-4 py-2 rounded-md font-semibold disabled:opacity-50">
          {{ busy ? 'Memproses...' : 'Buat Akun' }}
        </button>
      </form>

      <p v-if="message" class="mt-4 text-sm" :class="messageType==='error' ? 'text-red-600' : 'text-green-700'">{{ message }}</p>
    </section>

    <section v-else>
      <div class="mb-5 rounded-lg bg-blue-50 border border-blue-100 p-4 text-sm text-blue-800">
        Login berhasil. Role akun: <strong>{{ user.role }}</strong>. Akses fitur dibatasi oleh server berdasarkan role akun.
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div v-if="canManageOrders" class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit">
          <h2 class="text-lg font-semibold mb-4 border-b pb-2">Buat Pesanan Baru</h2>
          <form @submit.prevent="submitOrder" class="space-y-4">
            <div>
              <label class="block text-sm font-medium">Cari Customer (nama/nomor HP)</label>
              <input v-model.trim="customerQuery" @input="searchCustomers" type="text" autocomplete="off" placeholder="Ketik minimal 2 karakter..." class="mt-1 block w-full rounded-md p-2 border">
              <div v-if="customerSuggestions.length" class="mt-1 border rounded-md bg-white shadow-sm max-h-40 overflow-y-auto">
                <button v-for="c in customerSuggestions" :key="c.id" type="button" @click="selectCustomer(c)" class="block w-full text-left px-3 py-2 hover:bg-blue-50">
                  <strong>{{ c.name }}</strong>
                  <span class="block text-xs text-gray-500">{{ c.phone }}</span>
                </button>
              </div>
              <p v-if="selectedCustomer" class="mt-2 text-sm text-green-700">
                Dipilih: {{ selectedCustomer.name }} · {{ selectedCustomer.phone }}
                <button type="button" @click="clearCustomer" class="text-red-600 underline">Ganti</button>
              </p>
              <div v-if="!selectedCustomer" class="mt-3 space-y-2 rounded bg-gray-50 p-3">
                <p class="text-xs text-gray-600">Customer baru / guest</p>
                <input v-model.trim="form.customer_name" type="text" maxlength="100" required placeholder="Nama pelanggan" class="w-full rounded-md p-2 border">
                <input v-model.trim="form.customer_phone" type="tel" maxlength="30" required placeholder="Nomor HP pelanggan" class="w-full rounded-md p-2 border">
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium">Layanan</label>
              <select v-model="form.service_id" required class="mt-1 block w-full rounded-md p-2 border">
                <option value="" disabled>Pilih layanan...</option>
                <option v-for="srv in services" :key="srv.id" :value="srv.id">
                  {{ srv.name }} - Rp{{ parseInt(srv.price_per_kg).toLocaleString('id-ID') }}/kg
                </option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium">Berat (Kg)</label>
              <input v-model.number="form.weight" type="number" min="0.1" max="100" step="0.1" required class="mt-1 block w-full rounded-md p-2 border">
            </div>
            <button type="submit" class="w-full bg-blue-600 text-white px-4 py-2 rounded-md font-semibold">Simpan Pesanan</button>
          </form>
        </div>

        <div :class="canManageOrders ? 'lg:col-span-2' : 'lg:col-span-3'" class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="flex justify-between items-center p-4 border-b">
            <h2 class="font-semibold">{{ canManageOrders ? 'Daftar Pesanan Laundry' : 'Progress Laundry Saya' }}</h2>
            <button @click="fetchOrders" class="bg-blue-100 text-blue-700 px-3 py-2 rounded-md text-sm">Refresh</button>
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-4 py-3 text-left text-xs">{{ canManageOrders ? 'ID / PELANGGAN' : 'ID PESANAN' }}</th>
                  <th class="px-4 py-3 text-left text-xs">LAYANAN</th>
                  <th v-if="canManageOrders" class="px-4 py-3 text-left text-xs">TOTAL</th>
                  <th class="px-4 py-3 text-left text-xs">{{ canManageOrders ? 'STATUS' : 'PROGRESS LAUNDRY' }}</th>
                  <th v-if="canManageOrders" class="px-4 py-3 text-left text-xs">AKSI</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                <tr v-if="orders.length===0">
                  <td :colspan="canManageOrders ? 5 : 3" class="px-4 py-5 text-center text-sm text-gray-500">Belum ada data pesanan.</td>
                </tr>
                <tr v-for="order in orders" :key="order.id">
                  <td class="px-4 py-3 text-sm">
                    <strong>{{ order.id }}</strong>
                    <div v-if="canManageOrders" class="text-gray-500">{{ order.customer_name }}</div>
                  </td>
                  <td class="px-4 py-3 text-sm">
                    {{ order.service_name }}
                    <div class="text-gray-500">{{ order.weight }} Kg</div>
                  </td>
                  <td v-if="canManageOrders" class="px-4 py-3 text-sm font-semibold">Rp{{ parseInt(order.total_amount).toLocaleString('id-ID') }}</td>
                  <td class="px-4 py-3 text-sm">
                    <span class="inline-flex rounded-full bg-blue-100 px-3 py-1 font-semibold text-blue-800">{{ order.order_status }}</span>
                  </td>
                  <td v-if="canManageOrders" class="px-4 py-3 text-sm">
                    <select @change="updateStatus(order.id, $event.target.value, order.payment_status)" class="border rounded p-1 text-xs">
                      <option value="" selected disabled>Ubah Status</option>
                      <option v-for="status in statuses" :key="status" :value="status">{{ status }}</option>
                    </select>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script>
const API_URL = '/api'

export default {
  data() {
    return {
      user: null,
      token: sessionStorage.getItem('laundry_access_token') || '',
      authMode: 'login',
      busy: false,
      message: '',
      messageType: 'success',
      authForm: { email: '', password: '' },
      registerForm: { name: '', email: '', password: '' },
      services: [],
      orders: [],
      statuses: ['Queue', 'Washing', 'Ironing', 'Done', 'Picked Up'],
      form: {
        customer_name: '',
        customer_phone: '',
        customer_id: null,
        service_id: '',
        weight: ''
      },
      customerQuery: '',
      customerSuggestions: [],
      selectedCustomer: null
    }
  },

  computed: {
    canManageOrders() {
      return ['admin', 'staff'].includes(this.user?.role)
    }
  },

  methods: {
    setMessage(text, type = 'success') {
      this.message = text
      this.messageType = type
    },

    async api(path, options = {}) {
      const headers = { ...(options.headers || {}) }

      if (this.token) headers.Authorization = `Bearer ${this.token}`
      if (options.body) headers['Content-Type'] = 'application/json'

      const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers
      })

      const json = await response.json().catch(() => ({
        success: false,
        error: 'Respons server tidak valid.'
      }))

      if (response.status === 401 && path !== '/auth/login') {
        this.logout(false)
      }

      return { response, json }
    },

    async login() {
      this.busy = true
      this.setMessage('')

      try {
        const { response, json } = await this.api('/auth/login', {
          method: 'POST',
          body: JSON.stringify(this.authForm)
        })

        if (!response.ok || !json.success) {
          return this.setMessage(json.error || 'Login gagal.', 'error')
        }

        this.token = json.access_token
        sessionStorage.setItem('laundry_access_token', this.token)
        this.user = json.user
        this.authForm.password = ''

        await this.loadDashboard()
      } catch (_err) {
        this.setMessage('Tidak dapat terhubung ke server.', 'error')
      } finally {
        this.busy = false
      }
    },

    async register() {
      this.busy = true
      this.setMessage('')

      try {
        const { response, json } = await this.api('/auth/register', {
          method: 'POST',
          body: JSON.stringify(this.registerForm)
        })

        if (!response.ok || !json.success) {
          return this.setMessage(json.error || 'Registrasi gagal.', 'error')
        }

        const registeredEmail = this.registerForm.email
        this.registerForm = { name: '', email: '', password: '' }
        this.authMode = 'login'
        this.authForm.email = registeredEmail
        this.setMessage('Registrasi berhasil. Silakan login.')
      } catch (_err) {
        this.setMessage('Tidak dapat terhubung ke server.', 'error')
      } finally {
        this.busy = false
      }
    },

    logout(showMessage = true) {
      this.token = ''
      this.user = null
      this.orders = []
      sessionStorage.removeItem('laundry_access_token')

      if (showMessage) this.setMessage('Anda telah logout.')
    },

    async loadDashboard() {
      await this.fetchServices()
      await this.fetchOrders()
    },

    async restoreSession() {
      if (!this.token) return

      try {
        const { response, json } = await this.api('/auth/me')

        if (response.ok && json.success) {
          this.user = json.user
          await this.loadDashboard()
        } else {
          this.logout(false)
        }
      } catch (_err) {
        this.logout(false)
      }
    },

    async fetchServices() {
      try {
        const { response, json } = await this.api('/services')

        if (response.ok && json.success) {
          this.services = json.data
        }
      } catch (_err) {
        this.setMessage('Gagal memuat layanan.', 'error')
      }
    },

    async fetchOrders() {
      try {
        const { response, json } = await this.api('/orders')

        if (response.ok && json.success) {
          this.orders = json.data
        } else if (!response.ok) {
          this.setMessage(json.error || 'Gagal memuat pesanan.', 'error')
        }
      } catch (_err) {
        this.setMessage('Gagal memuat pesanan.', 'error')
      }
    },

    async searchCustomers() {
      this.selectedCustomer = null
      this.form.customer_id = null

      if (this.customerQuery.trim().length < 2) {
        this.customerSuggestions = []
        return
      }

      try {
        const { response, json } = await this.api(
          `/customers?q=${encodeURIComponent(this.customerQuery.trim())}`
        )

        this.customerSuggestions = response.ok && json.success ? json.data : []
      } catch (_err) {
        this.customerSuggestions = []
      }
    },

    selectCustomer(customer) {
      this.selectedCustomer = customer
      this.customerQuery = `${customer.name} (${customer.phone})`
      this.form.customer_id = customer.id
      this.form.customer_name = ''
      this.form.customer_phone = ''
      this.customerSuggestions = []
    },

    clearCustomer() {
      this.selectedCustomer = null
      this.customerQuery = ''
      this.form.customer_id = null
    },

    async submitOrder() {
      if (!this.canManageOrders) {
        return this.setMessage('Customer hanya dapat melihat progress laundry.', 'error')
      }

      const payload = this.form

      try {
        const { response, json } = await this.api('/orders', {
          method: 'POST',
          body: JSON.stringify(payload)
        })

        if (response.ok && json.success) {
          this.setMessage(`Pesanan ${json.order_id} berhasil dibuat.`)
          this.form = {
            customer_name: '',
            customer_phone: '',
            customer_id: null,
            service_id: '',
            weight: ''
          }
          this.customerQuery = ''
          this.selectedCustomer = null
          await this.fetchOrders()
        } else {
          this.setMessage(json.error || 'Gagal membuat pesanan.', 'error')
        }
      } catch (_err) {
        this.setMessage('Terjadi kesalahan jaringan.', 'error')
      }
    },

    async updateStatus(id, newStatus, currentPayment) {
      try {
        const { response, json } = await this.api(
          `/orders/${encodeURIComponent(id)}/status`,
          {
            method: 'PUT',
            body: JSON.stringify({
              order_status: newStatus,
              payment_status: currentPayment
            })
          }
        )

        if (response.ok && json.success) {
          await this.fetchOrders()
        } else {
          this.setMessage(json.error || 'Gagal mengubah status.', 'error')
        }
      } catch (_err) {
        this.setMessage('Terjadi kesalahan jaringan.', 'error')
      }
    }
  },

  mounted() {
    this.restoreSession()
  }
}
</script>
