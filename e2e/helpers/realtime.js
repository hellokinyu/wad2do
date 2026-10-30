// Exercise the real Supabase client over an intercepted Phoenix WebSocket.
export async function mockRealtime(page) {
  const channels = new Map()
  const left = []
  await page.routeWebSocket('**/realtime/v1/websocket**', (socket) => {
    socket.onMessage((message) => {
      const [joinRef, ref, topic, event, payload] = JSON.parse(String(message))
      if (event === 'phx_join') {
        const filters = (payload.config.postgres_changes || []).map((filter, index) => ({
          ...filter, id: index + 1,
        }))
        channels.set(topic, { socket, joinRef, filters })
        socket.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', {
          status: 'ok', response: { postgres_changes: filters },
        }]))
      } else if (event === 'heartbeat' || event === 'phx_leave') {
        if (event === 'phx_leave') left.push(topic)
        socket.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]))
      }
    })
  })
  return {
    channels,
    left,
    emit(topic, table, type, record) {
      const channel = channels.get('realtime:' + topic)
      const ids = channel.filters.filter((filter) => filter.table === table).map((filter) => filter.id)
      channel.socket.send(JSON.stringify([channel.joinRef, null, 'realtime:' + topic, 'postgres_changes', {
        ids,
        data: {
          schema: 'public', table, type, commit_timestamp: new Date().toISOString(), errors: [],
          record: type === 'DELETE' ? {} : record,
          old_record: type === 'DELETE' ? record : {},
          columns: Object.keys(record).map((name) => ({ name, type: 'text' })),
        },
      }]))
    },
  }
}
