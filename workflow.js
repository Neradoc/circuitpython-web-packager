/*
SPDX-FileCopyrightText: Copyright (c) 2022 Neradoc, https://neradoc.me
SPDX-License-Identifier: MIT
*/
const BAD_MPY = -1;

var workflow_url_base = "http://circuitpython.local";
var modules_to_install = [];
var modules_to_update = [];
var cpver = null;
var circup = null;
var install_running = false;

function semver(str) {
	return str.split("-")[0].split(/\./).map((x) => parseInt(x));
}

function semver_compare(a,b) {
	return (
		(parseInt(a.split(".")[0]) - parseInt(b.split(".")[0]))
		|| (parseInt(a.split(".")[1]) - parseInt(b.split(".")[1]))
		|| (parseInt(a.split(".")[2]) - parseInt(b.split(".")[2]))
	);
}

function headers() {
	var username = "";
	var password = "123456"; // $("#password").val();
	return new Headers({
		"Authorization": 'Basic ' + btoa(username + ":" + password),
	});
}

async function get_file(filepath) {
	var heads = headers();
	heads.append("Accept", "application/json")
	return await fetch(
		new URL("/fs"+filepath, workflow_url_base),
		{
			headers: heads,
			credentials: "include"
		}
	);
}

var _version_info = null;
async function cp_version_json() {
	if(_version_info !== null) {
		return _version_info;
	}
	var response = await fetch(
		new URL("/cp/version.json", workflow_url_base),
	);
	_version_info = await response.json();
	return _version_info;
}

async function cp_version() {
	var version_data = await cp_version_json();
	return version_data.version;
}

async function is_editable() {
	const status = await fetch(new URL("/fs/", workflow_url_base),
		{
			method: "OPTIONS",
			headers: headers(),
			credentials: "include",
		}
	);
	var editable = status.headers
		.get("Access-Control-Allow-Methods")
		.toLowerCase()
		.includes("delete");
	return editable;
}

async function start() {
	// setup the actual URL
	const response = await fetch(new URL("/cp/devices.json", workflow_url_base));
	let url = new URL("/", response.url);
	workflow_url_base = url.href;
	console.log(`New URL ${workflow_url_base}`);
	// get the version data
	cpver = semver(await cp_version());
	console.log(`Starting with Circuitpython version ${cpver}`);
	// init circup with the CP version
	circup = new Circup(true, cpver);
	await circup.setup_the_modules_list();
}

async function upload_file(upload_path, file) {
	let file_path = new URL("/fs" + upload_path, workflow_url_base);
	var heads = headers();
	heads.append('Content-Type', 'application/octet-stream');
	heads.append('X-Timestamp', file.lastModified);
	var file_data = await file.async("blob");
	const response = await fetch(file_path,
		{
			method: "PUT",
			headers: heads,
			credentials: "include",
			body: file_data,
		}
	);
}

async function create_dir(dir_path) {
	var heads = headers();
	heads.append('X-Timestamp', Date.now());
	const response = await fetch(
		new URL("/fs" + dir_path, workflow_url_base),
		{
			method: "PUT",
			headers: heads,
			credentials: "include",
		}
	);
}

async function install_modules(dependencies) {
	for(pos in dependencies) {
		var module_name = dependencies[pos];
		console.log("Installing", module_name);
		var module = circup.get_module(module_name);
		var module_files = await circup.list_module_files(module);
		if(module.package) {
			await create_dir(`/lib/${module.name}/`);
		}
		for(var ii in module_files) {
			var file = module_files[ii];
			var upload_path = file.name.replace(/^[^\/]+\//, "/");
			// var upload_path = file.name.replace(/^.+?\/lib\//, "/lib/");
			await upload_file(upload_path, file);
		}
	}
	await refresh_list();
}

async function install_all() {
	install_modules(modules_to_update);
}

async function get_module_version(module_name, libs_list) {
	var module = circup.get_module(module_name);
	var module_path = `/lib/${module.name}`
	var pkg = module.package;
	var module_files = [];

	var cpver = await cp_version();

	if(pkg && libs_list.includes(module.name)) {
		// look at all files in the package
		var response = await get_file(module_path + "/");
		var data = await response.json();
		// module_files = data.map((item) => item.name);
		module_files = data.map((item) => module_path + "/" + item.name);
	} else if(!pkg && libs_list.includes(module.name + ".py")) {
		module_files = [module_path+".py"];
	} else if(!pkg && libs_list.includes(module.name + ".mpy")) {
		module_files = [module_path+".mpy"];
	} else {
		return null;
	}

	var version = false;
	for(var file_name of module_files) {
		var file_response = await get_file("/" + file_name);
		if(!file_response.ok) { continue }
		var file_data = await file_response.text();
		// TODO: report the mpy format and compare to the CP version running
		if(file_data[1] == "\x05" && cpver[0] < 7
			|| file_data[1] != "\x05" && cpver[0] > 6) {
			return BAD_MPY;
		}
		var matches = file_data.match(/(\d+\.\d+\.\d+).+?__version__/);
		if(matches && matches.length > 1) {
			version = matches[1];
			break;
		}
	}
	return version;
}

function dont_need_update(module_name) {
	const index = modules_to_update.indexOf(module_name);
	if (index > -1) {
		modules_to_update.splice(index, 1);
	}
	if(modules_to_update.length == 0) {
		$("#circup .all_up_to_date").show()
	}
}

async function pre_update_process() {
	$("#circup .hide").hide();
	$("#circup .loading").show();
	$("#dependencies table tr").remove();
	// setup circup
	await start();
}

async function run_update_process(imports) {
	// list the libs, to know which are missing
	var response = await get_file("/lib/");
	var data = await response.json();
	var libs_list = data.map((item) => item.name);
	// get the dependencies
	var dependencies = [];
	imports.forEach((a_module) => {
		circup.get_dependencies(a_module, dependencies);
	});
	// list them
	dependencies.sort();

	$("#circup .loading").hide();
	$("#circup .title .circuitpy_version").html(await cp_version());
	$("#circup .title").show();
	$("#circup .title .version_info").show();

	modules_to_install = Array.from(dependencies);
	modules_to_update = Array.from(dependencies);

	for(var item of dependencies) {
		var module = circup.get_module(item);
		var file_name = module.name + (module.package ? "" : ".mpy");
		var icon = module.package ? "&#128193;" : "&#128196;";
		var template = $("#circup_row").html();
		var new_line = $(template);
		new_line.find("button.upload").on("click",(e) => {
			install_modules([item]);
		});
		new_line.find("button.upload").val(item);
		new_line.find(".icon").html(icon);
		new_line.find(".name").html(item);
		new_line.find(".bundle_version").html(module.version);
		new_line.find(".board_version").html("...");
		$("#dependencies table").append(new_line);

		// module versions from the board
		var version = await get_module_version(item, libs_list);
		//.then((version) => {
		if(1){
			if(version && version != BAD_MPY) {
				new_line.find(".board_version").html(version);
			}
			if(version === BAD_MPY) {
				// no file
				new_line.find(".status").html("&#10071;&#65039; Bad MPY format");
			} else if(version === null) {
				// no file
				new_line.find(".status").html("&#10071;&#65039; New dependency");
			} else if(version === false) {
				// invalid file, replace
				new_line.find(".status").html("&#10071;&#65039; Module invalid");
			} else if(module.version == version) {
				// no need to update
				new_line.addClass("exists");
				new_line.find(".status").html("Up to date");
				new_line.hide(2000, () => {
					$('#circup .line').removeClass("odd");
					$('#circup .line').removeClass("even");
					$('#circup .line:visible:odd').addClass("odd");
					$('#circup .line:visible:even').addClass("even");
				});
				dont_need_update(module.name);
			} else if(semver(module.version)[0] != semver(version)[0]) {
				// this is a major update
				new_line.find(".status").html("&#10071;&#65039; Major update");
			} else {
				// this is a normal update
				new_line.find(".status").html("&#10071;&#65039; Update available");
			}
		}
	}
	$("#circup .buttons").show();
}

async function auto_install(file_name) {
	await pre_update_process();
	$("#circup .title .filename").html(file_name);
	// list the files, check that file_name is there
	var response = await get_file("/");
	var data = await response.json();
	var file_list = data.map((item) => item.name);
	if(!file_list.includes(file_name)) {
		console.log(`Error: ${file_name} not found.`);
		return;
	}
	// get code.py
	const code_response = await get_file("/" + file_name);
	if(!code_response.ok) {
		console.log(`Error: ${file_name} not found.`);
		return;
	}
	const code_content = await code_response.text();
	// get the list
	const imports = circup.get_imports_from_python(code_content);
	// do the thing
	await run_update_process(imports);
}

async function update_all() {
	await pre_update_process();
	$("#circup .title .filename").html("/lib/");
	// get the list of libraries from the board
	var response = await get_file("/lib/");
	var data = await response.json();
	var libs_list = data
		.map((item) => item.name)
		.filter((item) => !item.startsWith("."))
		.map((item) => item.replace(/\.m?py$/,""));
	// do the thing
	await run_update_process(libs_list);
}

async function init_page() {
	var vinfo = await cp_version_json();
	$(".board_name").html(vinfo.board_name);
	$(".circuitpy_version").html(vinfo.version);
}

const running_buttons = "#auto_install, #update_all";
async function run_exclusively(command) {
	if(!install_running) {
		$(running_buttons).attr("disabled", true);
		install_running = true;
		await command();
		install_running = false;
		$(running_buttons).attr("disabled", false);
	}
}

$("#auto_install").on("click", (e) => {
	run_exclusively(() => auto_install("code.py"));
});
$("#update_all").on("click", (e) => {
	run_exclusively(() => update_all());
});

init_page();
