
//map
const map = [
	//"0123456789"
	"##########", //0
	"##.......#", //1
	"#..#.....#", //2
	"#......###", //3
	"#..A.....#", //4
	"#...##...#", //5
	"#........#", //6
	"#..####..#", //7
	"#.....#..#", //8
	"##########"  //9
];

//internal, configurable
const framerate = 30;
const debug = 0;

const shader_checker_subdiv = 6;
const cell_sz = 5;

const rotation_speed = Math.PI / 45;
const movement_step = 0.2;
const minimap_sz = 5;

const accel_y_lo = 0.1; //minimum change in rotation to trigger motion
const accel_z_fwd_trig = -3; //trigger fwd movement
const accel_z_bkw_trig = 1; //trigger reverse movement


//internals, non-configurable
var __canvas, __canvas_context;
var __canvas_buffer, __canvas_buffer_context;
var __fps = -1;
var __frame_counter = 0;
var __demo_mode = 1;
var __vr_mode = 1;
var __pupil_dist = 1;
const __pupil_dist_adjust_speed = 0.1;

const __map_w = map[0].length;
const __map_h = map.length;

var __fov = Math.PI / 2;
const __draw_dist = Math.sqrt(__map_w*__map_w + __map_h*__map_h) * cell_sz * 1.01;

var __player_x = 0;
var __player_y = 0;
var __player_angle = 0;

var __bkg_grad;

//kb button states
var __kb_left = 0;
var __kb_right = 0;
var __kb_up = 0;
var __kb_down = 0;
var __kb_a = 0;
var __kb_z = 0;
var __kb_s = 0;
var __kb_x = 0;

//accelerometer state
var __accel_present = false;
var __accel_mv_fwd = 0; //0 - still, 1 - fwd, -1 - bkw
var __accel_rot_min = 2;
var __accel_rot_scaling = 1/50;

//textures
var __textured = true;
//var __txt_wall;
var __txt_wall_canvas;

const MAX_INT = Number.MAX_SAFE_INTEGER;

function init() {
	__canvas = document.getElementById("myCanvas");
	__canvas_context = __canvas.getContext("2d");
	
	__canvas_buffer = document.createElement('canvas');
	__canvas_buffer.width = __canvas.width;
	__canvas_buffer.height = __canvas.height;
	__canvas_buffer_context = __canvas_buffer.getContext("2d");
	
	if(debug)
		__canvas_buffer.style="border:1px solid #d3d3d3;";
	
	__bkg_grad=__canvas_buffer_context.createLinearGradient(0,0,0,__canvas_buffer.height);
	__bkg_grad.addColorStop(0,"black");
	__bkg_grad.addColorStop(0.5,"white");
	__bkg_grad.addColorStop(1,"black");
	
	var __txt_wall = document.getElementById("texture_wall");
	__txt_wall_canvas = document.getElementById("texture_wall_canvas");
	__txt_wall_canvas.width = __txt_wall.width;
	__txt_wall_canvas.height = __txt_wall.height;
	__txt_wall_canvas.getContext('2d').drawImage(__txt_wall, 0, 0);
	
	for(var y=0; y<__map_h; y++)
		for(var x=0; x<__map_w; x++)
			if(map[y][x] == ">" || map[y][x] == "<" || map[y][x] == "A" || map[y][x] == "V") {
				if(map[y][x] == ">")
					__player_angle = 0;
				if(map[y][x] == "<")
					__player_angle = Math.PI;
				if(map[y][x] == "A")
					__player_angle = -Math.PI / 2;
				if(map[y][x] == "V")
					__player_angle = Math.PI / 2;
				
				__player_x = cell_sz * x + cell_sz/2;
				__player_y = cell_sz * y + cell_sz/2;
			}
	
	//TODO compile edges!
	//...
	//edge lookup list
	
	window.setInterval(function(){
		main_loop();
	}, 1000/framerate);
	
	window.setInterval(function(){
		update_fps_counter();
	}, 1000);
	
	document.addEventListener('keydown', function(event) {
		switch(event.keyCode) {
			case 37: __kb_left = 1; break;
			case 38: __kb_up = 1; break;
			case 39: __kb_right = 1; break;
			case 40: __kb_down = 1; break;
			
			case 87: btn_toggle_vr_click(); break; //key W
			case 83: __kb_s = 1; break; //key S: pupil_distance up
			case 88: __kb_x = 1; break; //key X: pupil_distance dwn
			
			case 65: __kb_a = 1; break; //key A: __fov up
			case 90: __kb_z = 1; break; //key Z: __fov dwn
			case 81: btn_toggle_demo_click(); break; //key Q
			
			case 69: btn_toggle_txt_click(); break; // key E: __textured on/off
		}
	});
	
	document.addEventListener('keyup', function(event) {
		switch(event.keyCode) {
			case 37: __kb_left = 0; break;
			case 38: __kb_up = 0; break;
			case 39: __kb_right = 0; break;
			case 40: __kb_down = 0; break;
			case 65: __kb_a = 0; break;
			case 90: __kb_z = 0; break;
			case 83: __kb_s = 0; break;
			case 88: __kb_x = 0; break;
		}
	});
	
	//if running on a device that has accelerometer support
	//var gyroPresent = false;
	window.addEventListener("devicemotion", function(e){
		if((!__accel_present) && (event.rotationRate.alpha || event.rotationRate.beta || event.rotationRate.gamma)) {
			__accel_present = true;
			//switch demo mode off
			btn_toggle_demo_click(0);
			//switch texturing off - slows down iphone
			//__textured = false;
		}
		
		/*	horiz, left down = x -9; y +-7
			horiz, right dwn = x +9; 
			vert, bottom dwn = y -9
			vert, top down   = y +9 */
			
		if(e.accelerationIncludingGravity.z<accel_z_fwd_trig)
			__accel_mv_fwd = 1;
		else if(e.accelerationIncludingGravity.z>accel_z_bkw_trig)
			__accel_mv_fwd = -1;
		else
			__accel_mv_fwd = 0;
		
		if(Math.abs(e.rotationRate.alpha)>__accel_rot_min) {
			var rotation = __accel_rot_scaling*event.rotationRate.alpha/180*Math.PI;
			
			//take device orientation into consideration
			if(e.accelerationIncludingGravity.x>0)
				__player_angle += rotation;
			else
				__player_angle -= rotation;
		}
	});
}

//TODO: cleanup below
//###################

function detect_collision(x, y) {
	var arr_x = Math.floor(x / cell_sz);
	var arr_y = Math.floor(y / cell_sz);
	
	if(arr_x <0 || arr_y <0) //out of bounds
		return 1;
	
	coll_cell_x = parseInt(arr_x);
	coll_cell_y = parseInt(arr_y);
	
	if(map[coll_cell_y][coll_cell_x] == "#")
		return 1; // hit
	else
		return 0;
}

function handle_kb() {
	if(__kb_a)
		btn_adj_fov_click(1);
	if(__kb_z)
		btn_adj_fov_click(-1);
	
	if(__kb_s)
		btn_adj_pd_click(1);
	if(__kb_x)
		btn_adj_pd_click(-1);
	
	if(__kb_left)
		__player_angle -= rotation_speed;
	if(__kb_right)
		__player_angle += rotation_speed;
	
	if(__kb_up || __accel_mv_fwd == 1) {  
		var npx = __player_x + movement_step * Math.cos(__player_angle);
		var npy = __player_y + movement_step * Math.sin(__player_angle);
		
		if(!detect_collision(npx, npy)) {
			__player_x = npx;
			__player_y = npy;
		}
	}
	
	if(__kb_down || __accel_mv_fwd == -1) {
		var npx = __player_x - movement_step * Math.cos(__player_angle);
		var npy = __player_y - movement_step * Math.sin(__player_angle);
		
		if(!detect_collision(npx, npy)) {
			__player_x = npx;
			__player_y = npy;
		}
	}
}

function draw_minimap (viewport_x, viewport_y, viewport_w, viewport_h) {
	var mm_x = viewport_x + viewport_w - minimap_sz*__map_w;
	var mm_y = viewport_y + viewport_h - minimap_sz*__map_h;
	
	for(var y=0; y<__map_h; y++)
		for(var x=0; x<__map_w; x++) {
			if(map[y][x] == "#")
				__canvas_buffer_context.fillStyle = "#000000";
			else
				__canvas_buffer_context.fillStyle = "#ffffff";
			
			__canvas_buffer_context.fillRect(mm_x + x*minimap_sz, mm_y + y*minimap_sz, minimap_sz, minimap_sz);
		}
	
	var mm_px = mm_x + __player_x / (__map_w*cell_sz) * (__map_w*minimap_sz);
	var mm_py = mm_y + __player_y / (__map_h*cell_sz) * (__map_h*minimap_sz);
	
	//draw angle..
	var mm_pax = minimap_sz * Math.cos(__player_angle);
	var mm_pay = minimap_sz * Math.sin(__player_angle);
	
	__canvas_buffer_context.strokeStyle="#0000ff";
	__canvas_buffer_context.beginPath();
	__canvas_buffer_context.moveTo(mm_px, mm_py);
	__canvas_buffer_context.lineTo(mm_px + mm_pax, mm_py + mm_pay);
	__canvas_buffer_context.stroke();
	
	//draw player..
	__canvas_buffer_context.fillStyle = "#ff0000";		
	__canvas_buffer_context.fillRect(mm_px - minimap_sz/4, mm_py - minimap_sz/4, minimap_sz/2, minimap_sz/2);
}

function calc_dist(cell_x, cell_y, view_x, view_y, ray_a) {
	var exact_dist = MAX_INT, ndist = 0.0;
	var texture_coor = 0;
	
	var k = Math.tan(ray_a);
	var b = view_y - k * view_x;
	
	/* a .
	   . b */
	var ptax = cell_x * cell_sz;
	var ptay = cell_y * cell_sz;
	var ptbx = (cell_x+1) * cell_sz;
	var ptby = (cell_y+1) * cell_sz;
	
	//visible ray in front of player: [__player_x, __player_y] => [__player_x + vx*__draw_dist, __player_y + vy*__draw_dist]
	var ux1 = view_x;
	var uy1 = view_y;
	var ux2 = view_x + Math.cos(ray_a)*__draw_dist;
	var uy2 = view_y + Math.sin(ray_a)*__draw_dist;
	
	if(ux1>ux2) {tmp=ux1; ux1=ux2; ux2=tmp;}
	if(uy1>uy2) {tmp=uy1; uy1=uy2; uy2=tmp;}
	
	
	//bottom
	var fx2 = (ptby - b) / k;
	if(fx2>=ptax && fx2<=ptbx && fx2>=ux1 && fx2<=ux2 && ptby>=uy1 && ptby<=uy2) {
		ndist = Math.sqrt((__player_x-fx2)*(__player_x-fx2) + (__player_y-ptby)*(__player_y-ptby));
		if(ndist < exact_dist) {
			exact_dist = ndist;
			texture_coor = fx2-ptax;
		}
	}
	
	//left
	var fy1 = k*ptax + b;
	if(fy1>=ptay && fy1<=ptby  && ptax>=ux1 && ptax<=ux2 && fy1>=uy1 && fy1<=uy2) {
		ndist = Math.sqrt((__player_x-ptax)*(__player_x-ptax) + (__player_y-fy1)*(__player_y-fy1));
		if(ndist<exact_dist) {
			exact_dist = ndist;
			texture_coor = fy1-ptay;
		}
	}
	
	//top
	var fx1 = (ptay - b) / k;
	if(fx1>=ptax && fx1<=ptbx  && fx1>=ux1 && fx1<=ux2 && ptay>=uy1 && ptay<=uy2) {
		ndist = Math.sqrt((__player_x-fx1)*(__player_x-fx1) + (__player_y-ptay)*(__player_y-ptay));		
		if(ndist<exact_dist) {
			exact_dist = ndist;
			texture_coor = fx1-ptax;
		}
	}
	
	//right
	var fy2 = k*ptbx + b;
	if(fy2>=ptay && fy2<=ptby  && ptbx>=ux1 && ptbx<=ux2 && fy2>=uy1 && fy2<=uy2) {
		ndist = Math.sqrt((__player_x-ptbx)*(__player_x-ptbx) + (__player_y-fy2)*(__player_y-fy2));
		if(ndist<exact_dist) {
			exact_dist = ndist;
			texture_coor = fy2-ptay;
		}
	}
	
	return {texture_coor: texture_coor, distance: exact_dist};
}


//#######################
//ok below this point

//texture shader
function shader_texture(canvas_x, texture_coor, projected_height) {
	var texture_x = (__txt_wall_canvas.width-1) * texture_coor / cell_sz;
	__canvas_buffer_context.drawImage(__txt_wall_canvas, texture_x, 0, 1, __txt_wall_canvas.height, canvas_x, (__canvas_buffer.height - projected_height) / 2, 1, projected_height);
	
	//attenuate texture by rendering a semi-transparent rect over it:
	var alpha_overlay = 0.5 - 0.5*projected_height/__canvas_buffer.height;
	__canvas_buffer_context.fillStyle="rgba(0,0,0,"+alpha_overlay+")";
	__canvas_buffer_context.fillRect(canvas_x, Math.floor((__canvas_buffer.height - projected_height) / 2), 1, projected_height);
}

//checker pattern shader
function shader_checker(canvas_x, texture_coor, projected_height) {
	//attenueate colors according to distance
	//max = #0000ff
	var color_channel_1 = Math.round(63 + 192 * projected_height/__canvas_buffer.height);
	var color_hi = "rgb(0, 0, " + color_channel_1 + ")";

	//max = #7d7dff (aka 125,125,255)
	var color_channel_2 = Math.round(32 + 93 * projected_height/__canvas_buffer.height);
	var color_low = "rgb("+ color_channel_2 + "," + color_channel_2 + ","+ color_channel_1+")";
	
	//which color_chosen to start?
	var color_select = 0;
	if(Math.floor(texture_coor / ( cell_sz / shader_checker_subdiv)) % 2 == 0 ) color_select = 1;

	//render
	for(var i=0; i<shader_checker_subdiv; i++) {
		var color_chosen = color_hi;
		if(color_select) color_chosen = color_low;

		//draw
		__canvas_buffer_context.fillStyle=color_chosen;
		__canvas_buffer_context.fillRect(canvas_x, Math.floor((__canvas_buffer.height - projected_height) / 2 + i * projected_height / shader_checker_subdiv), 1, Math.ceil(projected_height / shader_checker_subdiv))

		//swap colors
		color_select = !color_select;
	}
}

function update_fps_counter() {
	__fps = __frame_counter;
	__frame_counter = 0;
}

function draw_fps_counter(viewport_x, viewport_y, viewport_w, viewport_h) {
	__canvas_buffer_context.font = "10px monospace";
	__canvas_buffer_context.fillStyle = "#ff0000"
	__canvas_buffer_context.fillText(__fps, viewport_x + 5, viewport_y + viewport_h - 10);
}

function render_viewport(viewport_x, viewport_y, viewport_w, viewport_h, viewport_player_x, viewport_player_y) {
	for(var i = 0; i<viewport_w; i++) {
		var ray_a = (__player_angle - __fov / 2) + (i / viewport_w) * __fov;
		
		var proximal_collision = {texture_coor: 0, distance: MAX_INT};
				
		for(var y=0; y<__map_h; y++)
			for(var x=0; x<__map_w; x++)
				if(map[y][x] == "#") {
					var ncollision = calc_dist(x, y, viewport_player_x, viewport_player_y, ray_a);

					if(ncollision.distance < proximal_collision.distance) {
						proximal_collision.distance = ncollision.distance;
						proximal_collision.texture_coor = ncollision.texture_coor;
					}
				}
		
		var projected_height = 2 * viewport_h / proximal_collision.distance;
		if(projected_height > viewport_h)
			projected_height = viewport_h;
			
		if(__textured)
			shader_texture(viewport_x + i, proximal_collision.texture_coor, projected_height);
		else
			shader_checker(viewport_x + i, proximal_collision.texture_coor, projected_height);
	}
	
	//draw HUD
	draw_minimap(viewport_x, viewport_y, viewport_w, viewport_h);
	draw_fps_counter(viewport_x, viewport_y, viewport_w, viewport_h);
}

var __intro_timer = 10*framerate; //10 sec
var __intro_timer_fade = 2*framerate; //2 sec fade

function render_instructions() {
	if(__intro_timer<0)
		return;
	
	var w = __canvas.width;
	var h = __canvas.height;
	
	__canvas_buffer_context.font = "bold 18px monospace";
	__canvas_buffer_context.lineWidth = 5;
	
	//fade
	if(__intro_timer < __intro_timer_fade) {
		__canvas_buffer_context.fillStyle = "rgba(255, 255, 255, "+ (__intro_timer/__intro_timer_fade) + ")";
		__canvas_buffer_context.strokeStyle = "rgba(255, 255, 255, "+ (__intro_timer/__intro_timer_fade) + ")";
	}
	else {
		__canvas_buffer_context.fillStyle = "rgba(255, 255, 255, 1)";
		__canvas_buffer_context.strokeStyle = "rgba(255, 255, 255, 1)";
	}
	
	//draw Google Cardboard icon
	__canvas_buffer_context.beginPath();
	__canvas_buffer_context.moveTo(w/2-80, h/2-30);
	__canvas_buffer_context.lineTo(w/2+80, h/2-30);
	__canvas_buffer_context.lineTo(w/2+100, h/2-10);
	__canvas_buffer_context.lineTo(w/2+100, h/2+50);
	__canvas_buffer_context.lineTo(w/2+80, h/2+70);
	__canvas_buffer_context.lineTo(w/2+20, h/2+70);
	__canvas_buffer_context.lineTo(w/2, h/2+50);
	__canvas_buffer_context.lineTo(w/2-20, h/2+70);
	__canvas_buffer_context.lineTo(w/2-80, h/2+70);
	__canvas_buffer_context.lineTo(w/2-100, h/2+50);
	__canvas_buffer_context.lineTo(w/2-100, h/2-10);
	__canvas_buffer_context.lineTo(w/2-80, h/2-30);
	__canvas_buffer_context.stroke();
	
	__canvas_buffer_context.beginPath();
	__canvas_buffer_context.arc(w/2-50,h/2+20,20,0,2*Math.PI);
	__canvas_buffer_context.fill();
	
	__canvas_buffer_context.beginPath();
	__canvas_buffer_context.arc(w/2+50,h/2+20,20,0,2*Math.PI);
	__canvas_buffer_context.fill();
	
	var intro_text = "";
	
	//accelerometer?
	if(__accel_present)
		//TODO! hvis forkert rotation - ask to put in landscape mode
		intro_text = "Time to put your mobile into Google Cardboard!";
	else
		intro_text = "Get the full experience on a mobile device using Google Cardboard!";
	
	__canvas_buffer_context.fillText(intro_text, (w-__canvas_buffer_context.measureText(intro_text).width)/2, h/2-80);
	
	__intro_timer--;
}

function main_loop() {
	handle_kb();
	
	if(__demo_mode)
		__player_angle += Math.PI / 135;
	
	__canvas_buffer_context.fillStyle=__bkg_grad;
	__canvas_buffer_context.fillRect(0,0,__canvas_buffer.width,__canvas_buffer.height);
	
	//calculate eye position, basically player_pos + eye_unit_vector * scale
	// -- left eye: (y, -x)
	var left_eye_x = __player_x + Math.sin(__player_angle) * (__pupil_dist / 2) * __vr_mode;
	var left_eye_y = __player_y - Math.cos(__player_angle) * (__pupil_dist / 2) * __vr_mode;
	// -- right eye: (-y, x)
	var right_eye_x = __player_x - Math.sin(__player_angle) * (__pupil_dist / 2) * __vr_mode;
	var right_eye_y = __player_y + Math.cos(__player_angle) * (__pupil_dist / 2) * __vr_mode;
	
	render_viewport(0, 0, __canvas.height, __canvas.height, left_eye_x, left_eye_y);
	render_viewport(__canvas.height, 0, __canvas.height, __canvas.height, right_eye_x, right_eye_y);
	
	//intro
	render_instructions();
	
	__frame_counter++;
	
	//flip buffer
	__canvas_context.drawImage(__canvas_buffer, 0, 0);
}


//button handling

function btn_toggle_vr_click() {
	__vr_mode = !__vr_mode;
	
	var btn_text = "";
	
	if(__vr_mode)
		btn_text = "Turn VR mode off";
	else
		btn_text = "Turn VR mode on";
	
	document.getElementById("btn_toggle_vr").value = btn_text;
}

function btn_adj_pd_click(adj) {
	if(adj>0)
		__pupil_dist += __pupil_dist_adjust_speed;
	if(adj<0) {
		__pupil_dist -= __pupil_dist_adjust_speed;
		
		if(__pupil_dist<0)
			__pupil_dist=0;
	}
	
	document.getElementById("lbl_adj_pd_val").value = "PD: " + __pupil_dist.toFixed(2);
}

function btn_adj_fov_click(adj) {
	if(adj>0) {
		__fov += rotation_speed;
		
		if(__fov>(Math.PI*2))
			__fov = Math.PI*2;
	}
	if(adj<0) {
		__fov -= rotation_speed;
		
		if(__fov<0)
			__fov=0;
	}
	
	document.getElementById("lbl_adj_fov_val").value = "FOV: " + (180*__fov/Math.PI).toFixed(0);
}

function btn_toggle_demo_click(val = -1) {
	switch(val) {
		case -1: __demo_mode = !__demo_mode; break;
		case 0: __demo_mode = false; break;
		default: __demo_mode = true;
	}
	
	if(__demo_mode)
		btn_text = "Turn demo mode off";
	else
		btn_text = "Turn demo mode on";
	
	document.getElementById("btn_toggle_demo").value = btn_text;
}

function btn_toggle_txt_click() {
	__textured = !__textured;
	
	var btn_text = "";
	
	if(__textured)
		btn_text = "Turn textures off";
	else
		btn_text = "Turn textures on";
	
	document.getElementById("btn_toggle_txt").value = btn_text;
}
