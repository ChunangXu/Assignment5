"use strict";

// Configure consistent English date/time pickers across browsers.
function initDateTimePickers() {
	if (typeof window.flatpickr !== "function") {
		return;
	}

	window.flatpickr.localize(window.flatpickr.l10ns.default);

	window.flatpickr("#date", {
		dateFormat: "Y-m-d",
		locale: "default",
		allowInput: false,
	});

	window.flatpickr("#time", {
		enableTime: true,
		noCalendar: true,
		time_24hr: true,
		dateFormat: "H:i",
		locale: "default",
		allowInput: false,
	});
}

const STORAGE_KEYS = {
	events: "mvc_events",
	authUser: "mvc_auth_user",
};

// Model: handles event data, validation, and persistence.
class EventModel {
	constructor(storage) {
		this.storage = storage;
	}

	getAllEvents() {
		return this.#readEvents().sort((a, b) => {
			const aTime = new Date(`${a.date}T${a.time}`).getTime();
			const bTime = new Date(`${b.date}T${b.time}`).getTime();
			return aTime - bTime;
		});
	}

	addEvent(payload) {
		const validation = this.validateEvent(payload);
		if (!validation.valid) {
			return validation;
		}

		const events = this.#readEvents();
		events.push({
			id: crypto.randomUUID(),
			title: payload.title.trim(),
			description: payload.description.trim(),
			date: payload.date,
			time: payload.time,
			location: payload.location.trim(),
		});
		this.#writeEvents(events);
		return { valid: true };
	}

	updateEvent(id, payload) {
		const validation = this.validateEvent(payload);
		if (!validation.valid) {
			return validation;
		}

		const events = this.#readEvents();
		const index = events.findIndex((event) => event.id === id);
		if (index === -1) {
			return { valid: false, errors: ["Event not found."] };
		}

		events[index] = {
			...events[index],
			title: payload.title.trim(),
			description: payload.description.trim(),
			date: payload.date,
			time: payload.time,
			location: payload.location.trim(),
		};
		this.#writeEvents(events);
		return { valid: true };
	}

	deleteEvent(id) {
		const events = this.#readEvents();
		const nextEvents = events.filter((event) => event.id !== id);
		this.#writeEvents(nextEvents);
	}

	getEventById(id) {
		return this.#readEvents().find((event) => event.id === id) || null;
	}

	validateEvent(payload) {
		const errors = [];

		if (!payload.title || payload.title.trim().length < 2) {
			errors.push("Title must be at least 2 characters.");
		}
		if (!payload.description || payload.description.trim().length < 5) {
			errors.push("Description must be at least 5 characters.");
		}
		if (!payload.date) {
			errors.push("Date is required.");
		}
		if (!payload.time) {
			errors.push("Time is required.");
		}
		if (!payload.location || payload.location.trim().length < 2) {
			errors.push("Location must be at least 2 characters.");
		}

		// Validate date/time format after required checks pass.
		if (payload.date && payload.time) {
			const eventDateTime = new Date(`${payload.date}T${payload.time}`);
			if (Number.isNaN(eventDateTime.getTime())) {
				errors.push("Date or time format is invalid.");
			}
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}

	#readEvents() {
		const raw = this.storage.getItem(STORAGE_KEYS.events);
		if (!raw) {
			return [];
		}

		try {
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			// Fallback for corrupted storage payloads.
			return [];
		}
	}

	#writeEvents(events) {
		this.storage.setItem(STORAGE_KEYS.events, JSON.stringify(events));
	}
}

// Model: demo-only authentication state in localStorage.
class AuthModel {
	constructor(storage) {
		this.storage = storage;
		this.demoUser = {
			username: "admin",
			password: "password123",
		};
	}

	login(username, password) {
		const cleanUsername = (username || "").trim();
		const cleanPassword = (password || "").trim();

		if (!cleanUsername) {
			return { success: false, message: "Username is required." };
		}

		if (!cleanPassword) {
			return { success: false, message: "Password is required." };
		}

		if (cleanUsername !== this.demoUser.username) {
			return { success: false, message: "Username does not exist." };
		}

		if (cleanPassword !== this.demoUser.password) {
			return { success: false, message: "Password is incorrect." };
		}

		this.storage.setItem(STORAGE_KEYS.authUser, cleanUsername);
		return { success: true };
	}

	logout() {
		this.storage.removeItem(STORAGE_KEYS.authUser);
	}

	isAuthenticated() {
		return Boolean(this.storage.getItem(STORAGE_KEYS.authUser));
	}

	getCurrentUser() {
		return this.storage.getItem(STORAGE_KEYS.authUser) || "";
	}
}

// View: owns DOM reads/writes and rendering.
class EventView {
	constructor(doc) {
		this.doc = doc;

		this.authSection = doc.querySelector("#auth-section");
		this.appSection = doc.querySelector("#app-section");
		this.loginForm = doc.querySelector("#login-form");
		this.logoutBtn = doc.querySelector("#logout-btn");
		this.eventForm = doc.querySelector("#event-form");
		this.eventList = doc.querySelector("#event-list");
		this.authStatusMessage = doc.querySelector("#auth-status-message");
		this.statusMessage = doc.querySelector("#status-message");
		this.eventCount = doc.querySelector("#event-count");
		this.submitBtn = doc.querySelector("#submit-btn");
		this.cancelEditBtn = doc.querySelector("#cancel-edit-btn");
		this.formTitle = doc.querySelector("#form-title");
		this.eventId = doc.querySelector("#event-id");
		this.fields = {
			title: doc.querySelector("#title"),
			description: doc.querySelector("#description"),
			date: doc.querySelector("#date"),
			time: doc.querySelector("#time"),
			location: doc.querySelector("#location"),
		};
	}

	showAuth() {
		this.authSection.classList.remove("hidden");
		this.appSection.classList.add("hidden");
	}

	showApp() {
		this.authSection.classList.add("hidden");
		this.appSection.classList.remove("hidden");
	}

	showStatus(message, type = "") {
		// Route status messages to the currently visible section.
		const authVisible = !this.authSection.classList.contains("hidden");
		const target = authVisible ? this.authStatusMessage : this.statusMessage;
		const other = authVisible ? this.statusMessage : this.authStatusMessage;
		const lines = Array.isArray(message)
			? message.filter((line) => Boolean(line)).map((line) => String(line))
			: [String(message ?? "")];

		if (other) {
			other.textContent = "";
			other.className = "status";
		}

		if (!target) {
			return;
		}

		target.replaceChildren();
		// Render multiple validation errors as a list.
		if (lines.length > 1) {
			const list = this.doc.createElement("ul");
			list.className = "status-list";
			for (const line of lines) {
				const item = this.doc.createElement("li");
				item.textContent = line;
				list.appendChild(item);
			}
			target.appendChild(list);
		} else {
			target.textContent = lines[0] || "";
		}
		target.className = "status";
		if (type) {
			target.classList.add(type);
		}
	}

	clearStatus() {
		if (this.statusMessage) {
			this.statusMessage.textContent = "";
			this.statusMessage.className = "status";
		}
		if (this.authStatusMessage) {
			this.authStatusMessage.textContent = "";
			this.authStatusMessage.className = "status";
		}
	}

	getLoginInput() {
		const formData = new FormData(this.loginForm);
		return {
			username: formData.get("username"),
			password: formData.get("password"),
		};
	}

	resetLogin() {
		this.loginForm.reset();
	}

	getEventInput() {
		return {
			id: this.eventId.value,
			title: this.fields.title.value,
			description: this.fields.description.value,
			date: this.fields.date.value,
			time: this.fields.time.value,
			location: this.fields.location.value,
		};
	}

	loadEventIntoForm(event) {
		this.eventId.value = event.id;
		this.fields.title.value = event.title;
		this.fields.description.value = event.description;
		this.fields.date.value = event.date;
		this.fields.time.value = event.time;
		this.fields.location.value = event.location;
		this.formTitle.textContent = "Edit Event";
		this.submitBtn.textContent = "Save Changes";
		this.cancelEditBtn.classList.remove("hidden");
	}

	resetEventForm() {
		this.eventForm.reset();
		this.eventId.value = "";
		this.formTitle.textContent = "Create Event";
		this.submitBtn.textContent = "Add Event";
		this.cancelEditBtn.classList.add("hidden");
	}

	renderEventList(events) {
		this.eventCount.textContent = `${events.length} event${events.length === 1 ? "" : "s"}`;

		if (events.length === 0) {
			this.eventList.innerHTML = "<div class=\"empty\">No events yet. Add your first event.</div>";
			return;
		}

		this.eventList.innerHTML = events
			.map(
				(event) => `
				<article class="event-item" data-id="${event.id}">
					<h3>${this.escapeHtml(event.title)}</h3>
					<p class="event-meta">${this.escapeHtml(event.date)} | ${this.escapeHtml(event.time)} | ${this.escapeHtml(event.location)}</p>
					<p class="event-description">${this.escapeHtml(event.description)}</p>
					<div class="item-actions">
						<button class="btn secondary" data-action="edit" type="button">Edit</button>
						<button class="btn warn" data-action="delete" type="button">Delete</button>
					</div>
				</article>
			`
			)
			.join("");
	}

	escapeHtml(value) {
		const text = this.doc.createElement("span");
		text.innerText = String(value ?? "");
		return text.innerHTML;
	}
}

// Controller: coordinates user actions between models and view.
class EventController {
	constructor(eventModel, authModel, view) {
		this.eventModel = eventModel;
		this.authModel = authModel;
		this.view = view;
	}

	init() {
		this.#bindEvents();
		this.#renderByAuth();
	}

	#bindEvents() {
		// Login flow.
		this.view.loginForm.addEventListener("submit", (event) => {
			event.preventDefault();
			const payload = this.view.getLoginInput();
			const result = this.authModel.login(payload.username, payload.password);

			if (!result.success) {
				this.view.showStatus(result.message, "error");
				return;
			}

			this.view.resetLogin();
			this.#renderByAuth();
			this.view.showStatus("Login successful.", "success");
		});

		this.view.logoutBtn.addEventListener("click", () => {
			this.authModel.logout();
			this.view.resetEventForm();
			this.#renderByAuth();
			this.view.showStatus("Logged out.", "success");
		});

		// Create/update flow.
		this.view.eventForm.addEventListener("submit", (event) => {
			event.preventDefault();
			if (!this.authModel.isAuthenticated()) {
				this.view.showStatus("Please login first.", "error");
				this.#renderByAuth();
				return;
			}

			const payload = this.view.getEventInput();
			const isEdit = Boolean(payload.id);
			const result = isEdit
				? this.eventModel.updateEvent(payload.id, payload)
				: this.eventModel.addEvent(payload);

			if (!result.valid) {
				this.view.showStatus(result.errors, "error");
				return;
			}

			this.view.resetEventForm();
			this.view.showStatus(isEdit ? "Event updated." : "Event created.", "success");
			this.#renderEvents();
		});

		this.view.cancelEditBtn.addEventListener("click", () => {
			this.view.resetEventForm();
			this.view.clearStatus();
		});

		// Event delegation for edit/delete actions in the list.
		this.view.eventList.addEventListener("click", (event) => {
			const target = event.target;
			if (!(target instanceof HTMLElement)) {
				return;
			}

			const action = target.dataset.action;
			if (!action) {
				return;
			}

			const card = target.closest(".event-item");
			const id = card?.getAttribute("data-id");
			if (!id) {
				return;
			}

			if (action === "edit") {
				this.#handleEdit(id);
			}
			if (action === "delete") {
				this.#handleDelete(id);
			}
		});
	}

	#handleEdit(id) {
		if (!this.authModel.isAuthenticated()) {
			this.view.showStatus("Please login first.", "error");
			this.#renderByAuth();
			return;
		}

		const event = this.eventModel.getEventById(id);
		if (!event) {
			this.view.showStatus("Event no longer exists.", "error");
			this.#renderEvents();
			return;
		}

		this.view.loadEventIntoForm(event);
		this.view.showStatus("Edit mode enabled.", "success");
	}

	#handleDelete(id) {
		if (!this.authModel.isAuthenticated()) {
			this.view.showStatus("Please login first.", "error");
			this.#renderByAuth();
			return;
		}

		const confirmed = window.confirm("Delete this event?");
		if (!confirmed) {
			return;
		}

		this.eventModel.deleteEvent(id);
		this.view.resetEventForm();
		this.view.showStatus("Event deleted.", "success");
		this.#renderEvents();
	}

	#renderByAuth() {
		if (this.authModel.isAuthenticated()) {
			this.view.showApp();
			this.#renderEvents();
		} else {
			this.view.showAuth();
		}
	}

	#renderEvents() {
		const events = this.eventModel.getAllEvents();
		this.view.renderEventList(events);
	}
}

const eventModel = new EventModel(window.localStorage);
const authModel = new AuthModel(window.localStorage);
const view = new EventView(document);
const controller = new EventController(eventModel, authModel, view);

initDateTimePickers();
controller.init();
