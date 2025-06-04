import { createRouter, createWebHistory } from "vue-router";

// Import your components
import Personal from "../components/personal.vue";
import Group from "../components/group.vue";
import Login from "../components/login.vue";
import Register from "../components/register.vue";
import Profile from "../components/profile.vue";
import About from "../components/about.vue";
import GC from "../components/GC.vue";
import View from "../components/view.vue";
import GroupView from "../components/groupview.vue";

const router = createRouter({
	history: createWebHistory(import.meta.env.BASE_URL),
	routes: [
		{ path: "/", redirect: "/personal" },
		{ path: "/personal", component: Personal },
		{
			path: "/group/:groupId",
			name: "Group",
			component: Group,
			props: true,
		},
		{ path: "/login", component: Login },
		{ path: "/register", component: Register },
		{ path: "/profile", component: Profile },
		{ path: "/about", component: About },
		{ path: "/GC", name: "GC", component: GC },
		{ path: "/view", component: View },
		{ path: "/groupview", component: GroupView },
	],
});

export default router;
