export default {
  fetch(request, env) {
    return env.WORKSPACE.fetch(request);
  },
};
