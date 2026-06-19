const BASE = '/api'

function getToken() {
  return localStorage.getItem('dns_panel_token')
}

export function setToken(token) {
  localStorage.setItem('dns_panel_token', token)
}

export function clearToken() {
  localStorage.removeItem('dns_panel_token')
}

async function request(path, options = {}) {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (res.status === 401) {
    clearToken()
    window.location.href = '/login'
    return
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Erro desconhecido')
  }

  return res.json()
}

export const api = {
  login: (username, password) => {
    const form = new URLSearchParams({ username, password })
    return fetch(`${BASE}/auth/login`, {
      method: 'POST',
      body: form,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }).then(async r => {
      if (!r.ok) throw new Error('Credenciais inválidas')
      return r.json()
    })
  },

  me: () => request('/auth/me'),

  // Métricas
  system: () => request('/metrics/system'),
  timeseries: (range, bucket) => request(`/metrics/queries/timeseries?range=${range}&bucket=${bucket}`),
  total: (range) => request(`/metrics/queries/total?range=${range}`),
  topClients: (range, limit = 10) => request(`/metrics/clients/top?range=${range}&limit=${limit}`),
  topDomains: (range, limit = 20) => request(`/metrics/domains/top?range=${range}&limit=${limit}`),
  qtypes: (range) => request(`/metrics/qtypes?range=${range}`),
  uniqueClients: (range) => request(`/metrics/clients/unique?range=${range}`),

  // Operações
  rndcFlush:    () => request('/ops/rndc/flush', { method: 'POST' }),
  rndcStats:    () => request('/ops/rndc/stats', { method: 'POST' }),
  rndcReconfig: () => request('/ops/rndc/reconfig', { method: 'POST' }),
  rndcQuerylog: () => request('/ops/rndc/querylog', { method: 'POST' }),
  checkconf:    () => request('/ops/checkconf', { method: 'POST' }),

  // Bloqueios
  listBlocks:   () => request('/blocks/'),
  addBlock:     (domain) => request('/blocks/', { method: 'POST', body: JSON.stringify({ domain }) }),
  removeBlock:  (domain) => request(`/blocks/${domain}`, { method: 'DELETE' }),

  // Whitelist
  listWhitelist:  () => request('/whitelist/'),
  addWhitelist:   (domain, reason) => request('/whitelist/', { method: 'POST', body: JSON.stringify({ domain, reason }) }),
  removeWhitelist:(domain) => request(`/whitelist/${encodeURIComponent(domain)}`, { method: 'DELETE' }),

  // Auditoria
  listAudit: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/audit/${q ? '?' + q : ''}`)
  },

  // Usuários
  listUsers:      () => request('/users/'),
  createUser:     (data) => request('/users/', { method: 'POST', body: JSON.stringify(data) }),
  deleteUser:     (id) => request(`/users/${id}`, { method: 'DELETE' }),
  changeRole:     (id, role) => request(`/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  changePassword: (current_password, new_password) =>
    request('/users/me/password', { method: 'POST', body: JSON.stringify({ current_password, new_password }) }),

  // Ferramentas
  nslookup:   (data) => request('/tools/nslookup',   { method: 'POST', body: JSON.stringify(data) }),
  ping:       (data) => request('/tools/ping',       { method: 'POST', body: JSON.stringify(data) }),
  traceroute: (data) => request('/tools/traceroute', { method: 'POST', body: JSON.stringify(data) }),
  mtr:        (data) => request('/tools/mtr',        { method: 'POST', body: JSON.stringify(data) }),
  whois:      (data) => request('/tools/whois',      { method: 'POST', body: JSON.stringify(data) }),

  // Backups
  listBackups:   () => request('/backups/'),
  restoreBackup: (path) => request('/backups/restore', { method: 'POST', body: JSON.stringify({ path }) }),

  // Log do BIND
  bindlogTail: (lines = 200) => request(`/bindlog/tail?lines=${lines}`),

  // Restart BIND
  restartBind: () => request('/ops/bind/restart', { method: 'POST' }),

  // BIND Config
  getBindOptions:  () => request('/bindconfig/options'),
  saveBindOptions: (content) => request('/bindconfig/options', { method: 'PUT', body: JSON.stringify({ content }) }),
  getBindLocal:    () => request('/bindconfig/local'),
  saveBindLocal:   (content) => request('/bindconfig/local', { method: 'PUT', body: JSON.stringify({ content }) }),
  getZones:        () => request('/bindconfig/zones'),
  createZone:      (data) => request('/bindconfig/zones', { method: 'POST', body: JSON.stringify(data) }),
  deleteZone:      (name) => request(`/bindconfig/zones/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  getZoneRecords:  (name) => request(`/bindconfig/zones/${encodeURIComponent(name)}/records`),
  getZoneFile:     (name) => request(`/bindconfig/zones/${encodeURIComponent(name)}/file`),
  saveZoneFile:    (name, content) => request(`/bindconfig/zones/${encodeURIComponent(name)}/file`, { method: 'PUT', body: JSON.stringify({ content }) }),
  addRecord:       (zone, data) => request(`/bindconfig/zones/${encodeURIComponent(zone)}/records`, { method: 'POST', body: JSON.stringify(data) }),
  deleteRecord:    (zone, record_line) => request(`/bindconfig/zones/${encodeURIComponent(zone)}/records`, { method: 'DELETE', body: JSON.stringify({ record_line }) }),
  checkBindConf:        () => request('/bindconfig/check', { method: 'POST' }),
  validateBindContent:  (content, filename) => request('/bindconfig/validate', { method: 'POST', body: JSON.stringify({ content, filename }) }),

  // ACL / Configurações estruturadas
  getAcl:          () => request('/bindconfig/acl'),
  saveAcl:         (data) => request('/bindconfig/acl', { method: 'PUT', body: JSON.stringify(data) }),
  getBindBloqueios:  () => request('/bindconfig/bloqueios'),
  saveBindBloqueios: (content) => request('/bindconfig/bloqueios', { method: 'PUT', body: JSON.stringify({ content }) }),

  // Krill RPKI
  krillStatus:        () => request('/krill/status'),
  krillCas:           () => request('/krill/cas'),
  krillCreateCa:      (handle) => request('/krill/cas', { method: 'POST', body: JSON.stringify({ handle }) }),
  krillGetCa:         (ca) => request(`/krill/cas/${ca}`),
  krillChildRequest:  (ca) => request(`/krill/cas/${ca}/child-request`),
  krillAddParent:     (ca, handle, response_xml) => request(`/krill/cas/${ca}/parent`, { method: 'POST', body: JSON.stringify({ handle, response_xml }) }),
  krillRepoRequest:   (ca) => request(`/krill/cas/${ca}/repo-request`),
  krillConfigureRepo: (ca, response_xml) => request(`/krill/cas/${ca}/repo`, { method: 'POST', body: JSON.stringify({ response_xml }) }),
  krillRoas:          (ca) => request(`/krill/cas/${ca}/roas`),
  krillAddRoa:        (ca, roa) => request(`/krill/cas/${ca}/roas`, { method: 'POST', body: JSON.stringify(roa) }),
  krillRemoveRoa:     (ca, roa) => request(`/krill/cas/${ca}/roas`, { method: 'DELETE', body: JSON.stringify(roa) }),
  krillBgp:           (ca) => request(`/krill/cas/${ca}/bgp`),
}
