<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { findProfileAnimal } from '@/data/profileAnimals'
import AnimalAvatar from '@/components/AnimalAvatar.vue'

const props = defineProps({
  group: Object, // { id, name }
})
const emit = defineEmits(['changed'])

const router = useRouter()

const members = ref([]) // [{ id, name, animal }]
const userId = ref(null)
const memberError = ref('')

// Load the members, their display names and chosen avatars
async function loadMembers() {
  try {
    const { data: auth } = await supabase.auth.getUser()
    userId.value = auth.user.id

    const { data: rows, error } = await supabase.rpc('get_group_member_names', {
      p_group_id: props.group.id,
    })
    if (error) throw error
    members.value = rows.map((member) => ({
      id: member.id,
      name: member.display_name || 'Member',
      animal: findProfileAnimal(member.avatar_animal)?.id || '',
    }))
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
  <section class="group-panel mt-3" aria-label="Members" data-testid="members-panel">
    <h2 class="h6 fw-bold mb-3">Members</h2>
    <ul class="member-list mb-3">
      <li v-for="member in members" :key="member.id" class="member-row" data-testid="member-item">
        <AnimalAvatar
          v-if="member.animal"
          :animal="member.animal"
          :size="32"
          decorative
          data-testid="member-avatar"
        />
        <span v-else class="member-initial" aria-hidden="true">{{ member.name.charAt(0) }}</span>
        <span class="flex-grow-1 min-width-0">
          {{ member.name }}
          <span v-if="member.id === userId" class="text-secondary">(you)</span>
        </span>
        <button
          v-if="member.id !== userId"
          class="btn btn-sm btn-outline-danger rounded-pill px-3"
          data-testid="remove-member-button"
          @click="removeMember(member)"
        >
          Remove
        </button>
      </li>
    </ul>

    <p v-if="memberError" class="text-danger" data-testid="member-error">{{ memberError }}</p>

    <button
      class="btn btn-outline-danger rounded-pill px-4"
      data-testid="leave-group-button"
      @click="leaveGroup"
    >
      Leave group
    </button>
  </section>
</template>

<style scoped>
/* Same soft grey panel as the filters on the Activities page */
.group-panel {
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
}

.member-list {
  margin: 0;
  padding: 0;
  overflow: hidden;
  list-style: none;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
}

.member-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 8px 12px;
}

.member-row + .member-row {
  border-top: 1px solid var(--line);
}

/* First letter of the member's name, for members without a chosen avatar */
.member-initial {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--ink);
  color: var(--on-ink);
  font-size: 0.85rem;
  font-weight: 700;
  text-transform: uppercase;
}

.min-width-0 {
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
