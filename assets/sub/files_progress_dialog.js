/*
SPDX-FileCopyrightText: Copyright (c) Scott Shawcroft for Adafruit
SPDX-FileCopyrightText: Copyright (c) 2022 Neradoc, https://neradoc.me
SPDX-License-Identifier: MIT
*/
var callbacks = {}
var board_control = null
var current_password = null

async function get_password() {
	return await board_control.get_password()
}
async function close() {
	$("#files_progress_dialog").removeClass("popup_dialog")
	$("body").removeClass("popup_dialog")
	callbacks?.close?.("close")
}
async function open(title=null, callback_list=null, options={}) {
	if(callback_list) {
		Object.assign(callbacks, callback_list)
	}
	if(title != null) {
		$("#files_progress_dialog .title").html(title)
	}
	if(options.has_ok === false) {
		$("#files_progress_dialog .ok_button").hide()
	} else {
		$("#files_progress_dialog .ok_button").show()
	}
	if(options.has_cancel === false) {
		$("#files_progress_dialog .cancel_button").hide()
	} else {
		$("#files_progress_dialog .cancel_button").show()
	}
	$("#files_progress_dialog").addClass("popup_dialog")
	$("body").addClass("popup_dialog")
}
async function ok() {
	close()
	callbacks?.button?.("ok")
}
async function cancel() {
	close()
	callbacks?.button?.("cancel")
}
async function setup(board_ctrl, callback_list) {
	board_control = board_ctrl
	if(callback_list) {
		callbacks = callback_list
	}
	var info = await board_control.device_info()
	$("#files_progress_dialog .ok_button").on("click", ok)
	$("#files_progress_dialog .cancel_button").on("click", cancel)
	$("#files_progress_dialog .ok_button").prop("disabled", true)
	$("#files_progress_dialog .cancel_button").prop("disabled", true)
}
async function enable_buttons(status=true) {
	$("#files_progress_dialog .ok_button").prop("disabled", !status)
	$("#files_progress_dialog .cancel_button").prop("disabled", !status)
}
async function log(text) {
	var line = $("<div/>")
	line.html(text)
	$("#files_progress_dialog .list").append(line)
	// TODO: scroll
	
}
async function title(text) {
	if(text != undefined) {
		$("#files_progress_dialog .title").html(text)
	}
}
async function description(text) {
	if(text != undefined) {
		$("#files_progress_dialog .description").html(text)
	}
}

export { setup, open, close, ok, cancel, enable_buttons, log, title, description }
