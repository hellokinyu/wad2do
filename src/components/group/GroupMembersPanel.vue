<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'

const props = defineProps({
  group: Object, // { id, name }
})
const emit = defineEmits(['changed'])

const router = useRouter()

const members = ref([]) // [{ id, name }]
const userId = ref(null)
const memberError = ref('')

// Load the members and their display names
async function loadMembers() {
  try {
    const { data: auth } = await supabase.auth.getUser()
    userId.value = auth.user.id

    const { data: rows, error } = await supabase.rpc('get_group_member_names', {
      p_group_id: props.group.id,
    })
    if (error) throw error
    members.value = rows.map((member) => ({ id: member.id, name: member.display_name || 'Member' }))
  } catch (error) {
    console.log(error)
    memberError.value = "Couldn't load the members."
  }
}

onMounted(loadMembers)

// Removing and leaving run a database function (see docs/sql/group_members.sql), because
// it also clears the member's availability and votes, which normal members can't delete.

async function removeMember(member) {
  if (!confirm('Remove ' + member.name + ' from the group?')) return
  memberError.value = ''

  try {
    const { error } = await supabase.rpc('remove_group_member', {
      p_group_id: props.group.id,
      p_user_id: member.id,
    })
    if (error) throw error
    emit('changed') // reload the group so the member count and tabs update
  } catch (error) {
    console.log(error)
    memberError.value = "Couldn't remove that member. Please try again."
  }
}

async function leaveGroup() {
  let message = 'Leave ' + props.group.name + '?'
  if (members.value.length === 1) {
    message = "You're the last member, so leaving will delete the group. Continue?"
  }
  if (!confirm(message)) return
  memberError.value = ''

  try {
    const { error } = await supabase.rpc('remove_group_member', {
      p_group_id: props.group.id,
      p_user_id: userId.value,
    })
    if (error) throw error
    router.push('/groups')
  } catch (error) {
    console.log(error)
    memberError.value = "Couldn't leave the group. Please try again."
  }
}
</script>

<template>
  <div class="card mt-3" data-testid="members-panel">
    <div class="card-body">
      <h2 class="h5">Members</h2>
      <ul class="list-group mb-3">
        <li
          v-for="member in members"
          :key="member.id"
          class="list-group-item d-flex justify-content-between align-items-center"
          data-testid="member-item"
        >
          <span>
            {{ member.name }}
            <span v-if="member.id === userId" class="text-muted">(you)</span>
          </span>
          <button
            v-if="member.id !== userId"
            class="btn btn-sm btn-outline-danger"
            data-testid="remove-member-button"
            @click="removeMember(member)"
          >
            Remove
          </button>
        </li>
      </ul>

      <p v-if="memberError" class="text-danger" data-testid="member-error">{{ memberError }}</p>

      <button class="btn btn-outline-danger" data-testid="leave-group-button" @click="leaveGroup">
        Leave group
      </button>
    </div>
  </div>
</template>
