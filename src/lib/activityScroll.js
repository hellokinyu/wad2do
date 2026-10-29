// Router scroll restoration runs after mount, before asynchronous results are ready.
let activitiesRendered = Promise.resolve()

export function beginActivitiesRender() {
  let finish
  activitiesRendered = new Promise((resolve) => {
    finish = resolve
  })
  return finish
}

export function waitForActivitiesRender() {
  return activitiesRendered
}
