import { Workflow, WorkflowResponse, WorkflowFile } from "./workflow_base.js";
import { WORKFLOW_USERNAME, WORKFLOW_PASSWORD } from "../../config.js";

var hash = window.location.hash.substr(1);
var url_params = new URLSearchParams(document.location.search);

class WebResponse extends WorkflowResponse {
	constructor(response, content, ok=null) {
		if(ok===null) ok = response.ok;
		super(ok, content, response.status, response.statusText);
	}
}

class WebWorkflow extends Workflow {
	constructor() {
		super();
		this.workflow_url_base = "http://circuitpython.local";
		this.version_info = null;
	}
	async start() {
		// setup the actual URL for the workflow
		var url = new URL(window.location);
		var url_passed = url.searchParams.get("dev");
		if(url_passed) {
			console.log("Trying", url_passed);
			var url_test = new URL("/", `http://${url_passed}`);
			var response = await fetch(url_test);
			this.workflow_url_base = response.url;
		} else {
			console.log("Trying", this.workflow_url_base);
			var url_test = new URL("/", this.workflow_url_base);
			var response = await fetch(url_test);
			this.workflow_url_base = response.url;
		}
		console.log(`Board URL: ${this.workflow_url_base}`);
	}
	async device_info() {
		if(this.version_info !== null) {
			return this.version_info;
		}
		var response = await fetch(
			new URL("/cp/version.json", this.workflow_url_base),
		);
		this.version_info = await response.json();
		return this.version_info;
	}
	async cp_version() {
		var version_data = await this.device_info();
		return version_data.version;
	}
	async is_editable() {
		const status = await fetch(new URL("/fs/", this.workflow_url_base),
			{
				method: "OPTIONS",
				credentials: "include",
			}
		);
		var editable = status.headers
			.get("Access-Control-Allow-Methods")
			.toLowerCase()
			.includes("delete");
		console.log("IS EDITABLE", editable);
		return editable;
	}
	async get_file_content(file_path, range=null) {
		var heads = this.headers();
		var url = new URL("/fs"+file_path, this.workflow_url_base);
		var response = await fetch(
			url,
			{
				headers: heads,
				credentials: "include",
			}
		);
		try {
			var file_content = await response.text();
			return new WebResponse(response, file_content);
		} catch {
			return new WebResponse(response, null, false);
		}
	}
	async list_dir(dir_path) {
		if (!dir_path.endsWith("/")) {
			dir_path += "/";
		}
		var heads = this.headers({"Accept": "application/json"});
		var url = new URL("/fs"+dir_path, this.workflow_url_base);
		var response = await fetch(
			url,
			{
				headers: heads,
				credentials: "include",
			}
		);
		try {
			var data = await response.json();
			return new WebResponse(response, data);
		} catch {
			return new WebResponse(response, [], false);
		}
	}
	async upload_file(upload_path, file) {
		var heads = this.headers({
			'Content-Type': 'application/octet-stream',
			'X-Timestamp': file.lastModified,
		});
		var file_data = await file.async("blob");
		const file_url = new URL("/fs" + upload_path, this.workflow_url_base);
		console.log("UPLOAD", file_url.href);
		const response = await fetch(file_url,
			{
				method: "PUT",
				headers: heads,
				credentials: "include",
				body: file_data,
			}
		);
		if(response.status == 409) {
			console.log("Error: Cannot write to the drive");
			return new WorkflowResponse(false, null, 409, "Error: Cannot write to the drive");
		}
		return new WorkflowResponse(true, null);
	}
	async create_dir(dir_path) {
		var heads = this.headers({'X-Timestamp': Date.now()});
		const response = await fetch(
			new URL("/fs" + dir_path, this.workflow_url_base),
			{
				method: "PUT",
				headers: heads,
				credentials: "include",
			}
		);
		if(response.status == 409) {
			console.log("Error: Cannot write to the drive");
			return new WorkflowResponse(false, null, 409, "Error: Cannot write to the drive");
		}
		return new WorkflowResponse(true, null);
	}
	async delete_file(file_path) {
		const response = await fetch(file_path,
			{
				method: "DELETE",
				headers: this.headers(),
			}
		)
		return new WebResponse(response, "");
	}

	//##############################################################

	set_credentials(user, password) {
		this.user = user;
		this.password = password;
	}

	get_password() {
		return $("#password").val();
	}
	
	headers(others=null) {
		var username = WORKFLOW_USERNAME;
		var password = WORKFLOW_PASSWORD;
		var password_field = this.get_password();
		if (password_field) {
			password = password_field;
		} else if (WORKFLOW_PASSWORD == null) {
			alert("The workflow password must be set.");
			// $(".tab_link_home").click();
		}
		// throw 'This is not used anymore !';
		var encoded = btoa(username + ":" + password);
		var head = new Headers({
			"Authorization": 'Basic ' + encoded,
		});
		if (others) {
			for (var key in others) {
				head.append(key, others[key]);
			}
		}
		return head;
	}

	async find_devices() {
		var response = await fetch(new URL("/cp/devices.json", this.workflow_url_base));
		const data = await response.json();
		return data;
	}

}

export { WebWorkflow };
