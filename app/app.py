from flask import Flask, request, send_file, jsonify, render_template, send_from_directory
from werkzeug.utils import secure_filename
import os
import json
import shutil
from zipfile import ZipFile
from PIL import Image

app = Flask(__name__)

PROJECTS_DIR = os.path.join(os.path.dirname(__file__), 'projects')
if not os.path.exists(PROJECTS_DIR):
    os.makedirs(PROJECTS_DIR)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/create_project', methods=['POST'])
def create_project():
    data = request.get_json()
    project_name = data.get('project_name')
    if not project_name:
        return jsonify({'status': 'error', 'message': 'Nombre del proyecto requerido'}), 400
    
    project_dir = os.path.join(PROJECTS_DIR, project_name)
    if not os.path.exists(project_dir):
        os.makedirs(project_dir)
    
    return jsonify({'status': 'success', 'project_name': project_name})

@app.route('/save_polygons', methods=['POST'])
def save_polygons():
    data = request.get_json()
    project_name = data.get('project_name')
    camera_name = data.get('camera_name')
    polygons = data.get('polygons')
    
    project_dir = os.path.join(PROJECTS_DIR, project_name)
    if not os.path.exists(project_dir):
        os.makedirs(project_dir)
    
    with open(os.path.join(project_dir, f'{camera_name}.json'), 'w') as f:
        json.dump({'polygons': polygons}, f)
    
    return jsonify({'status': 'success'})

@app.route('/load_camera', methods=['POST'])
def load_camera():
    data = request.get_json()
    project_name = data.get('project_name')
    camera_name = data.get('camera_name')
    
    json_path = os.path.join(PROJECTS_DIR, project_name, f'{camera_name}.json')
    img_path = os.path.join(PROJECTS_DIR, project_name, f'{camera_name}.jpg')
    
    polygons = []
    if os.path.exists(json_path):
        with open(json_path, 'r') as f:
            polygons = json.load(f)['polygons']
    
    image_url = f'/projects/{project_name}/{camera_name}.jpg' if os.path.exists(img_path) else None
    width, height = 0, 0
    if os.path.exists(img_path):
        with Image.open(img_path) as img:
            width, height = img.size
    
    return jsonify({
        'polygons': polygons,
        'image_path': image_url,
        'original_width': width,
        'original_height': height
    })

@app.route('/upload_image', methods=['POST'])
def upload_image():
    project_name = request.form.get('project_name')
    camera_name = request.form.get('camera_name')
    file = request.files['image']
    
    project_dir = os.path.join(PROJECTS_DIR, project_name)
    if not os.path.exists(project_dir):
        os.makedirs(project_dir)
    
    filename = secure_filename(f'{camera_name}.jpg')
    file_path = os.path.join(project_dir, filename)
    file.save(file_path)
    return jsonify({'status': 'success', 'image_path': f'/projects/{project_name}/{filename}'})

@app.route('/list_projects', methods=['GET'])
def list_projects():
    projects = [d for d in os.listdir(PROJECTS_DIR) if os.path.isdir(os.path.join(PROJECTS_DIR, d))]
    return jsonify({'projects': projects})

@app.route('/list_cameras', methods=['POST'])
def list_cameras():
    project_name = request.get_json().get('project_name')
    project_dir = os.path.join(PROJECTS_DIR, project_name)
    if not os.path.exists(project_dir):
        return jsonify({'cameras': []})
    
    cameras = [f.split('.')[0] for f in os.listdir(project_dir) if f.endswith('.jpg')]
    return jsonify({'cameras': cameras})

@app.route('/export_project', methods=['POST'])
def export_project():
    project_name = request.get_json().get('project_name')
    project_dir = os.path.join(PROJECTS_DIR, project_name)
    zip_path = os.path.join(PROJECTS_DIR, f'{project_name}.zip')
    txt_path = os.path.join(project_dir, f'{project_name}_polygons.txt')

    with open(txt_path, 'w') as txt_file:
        for camera_file in os.listdir(project_dir):
            if camera_file.endswith('.json'):
                camera_name = camera_file.replace('.json', '')
                json_path = os.path.join(project_dir, camera_file)
                img_path = os.path.join(project_dir, f'{camera_name}.jpg')
                
                with open(json_path, 'r') as f:
                    polygons = json.load(f)['polygons']
                
                txt_file.write(f"{camera_name}\n")
                for i, poly in enumerate(polygons, 1):
                    adjusted_poly = [[int(x), int(y)] for x, y in poly]
                    coords_str = ';'.join(f"{x};{y}" for x, y in adjusted_poly)
                    txt_file.write(f"Poligono {i}: {adjusted_poly}\n")
                    txt_file.write(f"{coords_str}\n")
                txt_file.write("\n")

    with ZipFile(zip_path, 'w') as zipf:
        for root, _, files in os.walk(project_dir):
            for file in files:
                zipf.write(os.path.join(root, file), os.path.relpath(os.path.join(root, file), project_dir))
    
    return send_file(zip_path, as_attachment=True)

@app.route('/import_project', methods=['POST'])
def import_project():
    file = request.files['project_zip']
    project_name = request.form.get('project_name')
    project_dir = os.path.join(PROJECTS_DIR, project_name)
    
    if os.path.exists(project_dir):
        shutil.rmtree(project_dir)
    os.makedirs(project_dir)
    
    with ZipFile(file, 'r') as zipf:
        zipf.extractall(project_dir)
    
    return jsonify({'status': 'success'})

@app.route('/delete_camera', methods=['POST'])
def delete_camera():
    data = request.get_json()
    project_name = data.get('project_name')
    camera_name = data.get('camera_name')
    
    project_dir = os.path.join(PROJECTS_DIR, project_name)
    img_path = os.path.join(project_dir, f'{camera_name}.jpg')
    json_path = os.path.join(project_dir, f'{camera_name}.json')
    
    if os.path.exists(img_path):
        os.remove(img_path)
    if os.path.exists(json_path):
        os.remove(json_path)
    
    return jsonify({'status': 'success'})

@app.route('/delete_project', methods=['POST'])
def delete_project():
    project_name = request.get_json().get('project_name')
    project_dir = os.path.join(PROJECTS_DIR, project_name)
    
    if os.path.exists(project_dir):
        shutil.rmtree(project_dir)
    
    return jsonify({'status': 'success'})

@app.route('/projects/<project_name>/<filename>')
def serve_project_image(project_name, filename):
    return send_from_directory(os.path.join(PROJECTS_DIR, project_name), filename)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5006)