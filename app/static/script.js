const canvas = new fabric.Canvas('canvas', { width: 800, height: 600 });
let currentPolygon = [];
let polygons = [];
let correctionMode = false;
let selectedPoint = null;
let backgroundImage = null;
let currentProject = null;
let currentCamera = null;
let originalImageWidth = 0;
let originalImageHeight = 0;
let currentScale = 1;

function loadProjects() {
    fetch('/list_projects')
        .then(response => response.json())
        .then(data => {
            const projectSelect = document.getElementById('projectSelect');
            projectSelect.innerHTML = '<option value="">Selecciona un proyecto</option>';
            data.projects.forEach(project => {
                const option = document.createElement('option');
                option.value = project;
                option.textContent = project;
                projectSelect.appendChild(option);
            });
        });
}

function createProject() {
    const projectName = document.getElementById('projectName').value.trim();
    if (!projectName) {
        alert('Por favor, ingresa un nombre para el proyecto');
        return;
    }

    fetch('/create_project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_name: projectName })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            currentProject = projectName;
            loadProjects();
            document.getElementById('projectSelect').value = currentProject;
            loadProject();
            alert(`Proyecto "${projectName}" creado exitosamente`);
        } else {
            alert(`Error: ${data.message}`);
        }
    });
}

function loadProject() {
    currentProject = document.getElementById('projectSelect').value;
    if (currentProject) {
        fetch('/list_cameras', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_name: currentProject })
        })
        .then(response => response.json())
        .then(data => {
            const cameraButtons = document.getElementById('camera-buttons');
            cameraButtons.innerHTML = '';
            data.cameras.forEach(camera => {
                const button = document.createElement('button');
                button.textContent = camera;
                button.onclick = () => loadCamera(camera);
                
                const deleteButton = document.createElement('button');
                deleteButton.textContent = 'X';
                deleteButton.className = 'delete-btn';
                deleteButton.onclick = () => deleteCamera(camera);
                
                const container = document.createElement('span');
                container.appendChild(button);
                container.appendChild(deleteButton);
                cameraButtons.appendChild(container);
            });
        });
    } else {
        document.getElementById('camera-buttons').innerHTML = '';
    }
}

function addCamera() {
    const cameraName = document.getElementById('cameraName').value.trim();
    const file = document.getElementById('imageInput').files[0];
    if (!currentProject || !cameraName || !file) return;

    const formData = new FormData();
    formData.append('project_name', currentProject);
    formData.append('camera_name', cameraName);
    formData.append('image', file);

    fetch('/upload_image', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        loadCamera(cameraName);
        loadProject();
    });
}

function replaceCameraImage() {
    if (!currentProject || !currentCamera) {
        alert('Selecciona una cámara primero');
        return;
    }
    const file = document.getElementById('imageInput').files[0];
    if (!file) {
        alert('Selecciona una imagen para reemplazar');
        return;
    }

    const formData = new FormData();
    formData.append('project_name', currentProject);
    formData.append('camera_name', currentCamera);
    formData.append('image', file);

    fetch('/upload_image', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        loadCamera(currentCamera);
        alert(`Imagen de ${currentCamera} reemplazada`);
    });
}

function deleteCamera(cameraName) {
    if (!confirm(`¿Seguro que quieres eliminar la cámara "${cameraName}"?`)) return;

    fetch('/delete_camera', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_name: currentProject, camera_name: cameraName })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            if (currentCamera === cameraName) {
                currentCamera = null;
                canvas.clear();
                canvas.setBackgroundImage(null);
            }
            loadProject();
            alert(`Cámara "${cameraName}" eliminada`);
        } else {
            alert('Error al eliminar la cámara');
        }
    });
}

function deleteProject() {
    if (!currentProject) {
        alert('Selecciona un proyecto primero');
        return;
    }
    if (!confirm(`¿Seguro que quieres eliminar el proyecto "${currentProject}"?`)) return;

    fetch('/delete_project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_name: currentProject })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            currentProject = null;
            currentCamera = null;
            canvas.clear();
            canvas.setBackgroundImage(null);
            loadProjects();
            document.getElementById('projectSelect').value = '';
            document.getElementById('camera-buttons').innerHTML = '';
            alert('Proyecto eliminado');
        } else {
            alert('Error al eliminar el proyecto');
        }
    });
}

function loadCamera(cameraName) {
    currentCamera = cameraName;
    fetch('/load_camera', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_name: currentProject, camera_name: cameraName })
    })
    .then(response => response.json())
    .then(data => {
        polygons = data.polygons || [];
        const img = new Image();
        img.onload = () => {
            originalImageWidth = data.original_width;
            originalImageHeight = data.original_height;

            const canvasWidth = 800;
            const canvasHeight = 600;
            const widthRatio = canvasWidth / originalImageWidth;
            const heightRatio = canvasHeight / originalImageHeight;
            currentScale = Math.min(widthRatio, heightRatio);

            backgroundImage = new fabric.Image(img, {
                scaleX: currentScale,
                scaleY: currentScale,
                originX: 'left',
                originY: 'top'
            });
            canvas.setBackgroundImage(backgroundImage, canvas.renderAll.bind(canvas));

            const scaledWidth = originalImageWidth * currentScale;
            const scaledHeight = originalImageHeight * currentScale;
            canvas.setWidth(Math.max(canvasWidth, scaledWidth + 50));
            canvas.setHeight(Math.max(canvasHeight, scaledHeight + 50));
            canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);

            polygons = polygons.map(poly => poly.map(([x, y]) => [x * currentScale, y * currentScale]));
            drawPolygons();
        };
        img.src = data.image_path;
    });
}

canvas.on('mouse:down', (event) => {
    const pointer = canvas.getPointer(event.e);
    if (!correctionMode) {
        if (event.e.button === 2 && currentPolygon.length > 0) {
            currentPolygon.pop();
            drawPolygons();
        } else if (currentPolygon.length > 2 && 
            Math.hypot(pointer.x - currentPolygon[0][0], pointer.y - currentPolygon[0][1]) < 10) {
            polygons.push([...currentPolygon]);
            currentPolygon = [];
            drawPolygons();
        } else if (event.e.button === 0) {
            currentPolygon.push([pointer.x, pointer.y]);
            drawPolygons();
        }
    } else if (event.e.button === 0) {
        const midPointClicked = checkMidPointClick(pointer);
        if (midPointClicked) {
            const [polyIdx, segmentIdx] = midPointClicked;
            const newPoint = [
                (polygons[polyIdx][segmentIdx][0] + polygons[polyIdx][segmentIdx + 1][0]) / 2,
                (polygons[polyIdx][segmentIdx][1] + polygons[polyIdx][segmentIdx + 1][1]) / 2
            ];
            polygons[polyIdx].splice(segmentIdx + 1, 0, newPoint);
            drawPolygons();
        } else {
            let foundExistingPoint = false;
            for (let polyIdx = 0; polyIdx < polygons.length; polyIdx++) {
                const poly = polygons[polyIdx];
                for (let pointIdx = 0; pointIdx < poly.length; pointIdx++) {
                    if (Math.hypot(pointer.x - poly[pointIdx][0], pointer.y - poly[pointIdx][1]) < 10) {
                        selectedPoint = [polyIdx, pointIdx];
                        foundExistingPoint = true;
                        break;
                    }
                }
                if (foundExistingPoint) break;
            }
            if (foundExistingPoint) {
                canvas.on('mouse:move', onMouseMove);
                canvas.on('mouse:up', onMouseUp);
            } else {
                selectedPoint = null;
            }
        }
    }
});

canvas.on('mouse:move', (event) => {
    if (correctionMode && !canvas.isDragging) {
        const pointer = canvas.getPointer(event.e);
        selectedPoint = null;
        polygons.forEach((poly, polyIdx) => {
            poly.forEach((point, pointIdx) => {
                if (Math.hypot(pointer.x - point[0], pointer.y - point[1]) < 10) {
                    selectedPoint = [polyIdx, pointIdx];
                }
            });
        });
    }
});

function onMouseMove(event) {
    if (correctionMode && selectedPoint) {
        const pointer = canvas.getPointer(event.e);
        const [polyIdx, pointIdx] = selectedPoint;
        polygons[polyIdx][pointIdx] = [pointer.x, pointer.y];
        drawPolygons();
    }
}

function onMouseUp() {
    canvas.off('mouse:move', onMouseMove);
    canvas.off('mouse:up', onMouseUp);
}

function checkMidPointClick(pointer) {
    for (let polyIdx = 0; polyIdx < polygons.length; polyIdx++) {
        const poly = polygons[polyIdx];
        for (let i = 0; i < poly.length - 1; i++) {
            const midPoint = [
                (poly[i][0] + poly[i + 1][0]) / 2,
                (poly[i][1] + poly[i + 1][1]) / 2
            ];
            if (Math.hypot(pointer.x - midPoint[0], pointer.y - midPoint[1]) < 10) {
                return [polyIdx, i];
            }
        }
        if (poly.length > 2) {
            const lastMidPoint = [
                (poly[poly.length - 1][0] + poly[0][0]) / 2,
                (poly[poly.length - 1][1] + poly[0][1]) / 2
            ];
            if (Math.hypot(pointer.x - lastMidPoint[0], pointer.y - lastMidPoint[1]) < 10) {
                return [polyIdx, poly.length - 1];
            }
        }
    }
    return null;
}

function drawPolygons() {
    canvas.getObjects().forEach(obj => canvas.remove(obj));
    polygons.forEach((poly, idx) => {
        const points = [...poly, poly[0]].map(p => ({ x: p[0], y: p[1] }));
        const polygon = new fabric.Polyline(points, { stroke: 'red', fill: '', strokeWidth: 2 });
        canvas.add(polygon);
        poly.forEach((p, i) => {
            canvas.add(new fabric.Circle({ left: p[0] - 5, top: p[1] - 5, radius: 5, fill: 'red' }));
            if (i === 0) {
                canvas.add(new fabric.Text(`${idx + 1}`, { left: p[0], top: p[1], fill: 'blue', fontSize: 18 }));
            }
            if (correctionMode && i < poly.length - 1) {
                const midPoint = [
                    (poly[i][0] + poly[i + 1][0]) / 2,
                    (poly[i][1] + poly[i + 1][1]) / 2
                ];
                canvas.add(new fabric.Circle({ left: midPoint[0] - 5, top: midPoint[1] - 5, radius: 5, fill: 'none', stroke: 'red', strokeWidth: 1 }));
            }
        });
        if (correctionMode && poly.length > 2) {
            const lastMidPoint = [
                (poly[poly.length - 1][0] + poly[0][0]) / 2,
                (poly[poly.length - 1][1] + poly[0][1]) / 2
            ];
            canvas.add(new fabric.Circle({ left: lastMidPoint[0] - 5, top: lastMidPoint[1] - 5, radius: 5, fill: 'none', stroke: 'red', strokeWidth: 1 }));
        }
    });
    currentPolygon.forEach((p, i) => {
        canvas.add(new fabric.Circle({ left: p[0] - 5, top: p[1] - 5, radius: 5, fill: 'red' }));
        if (i > 0) {
            const line = new fabric.Line(
                [currentPolygon[i-1][0], currentPolygon[i-1][1], p[0], p[1]],
                { stroke: 'red', strokeWidth: 2 }
            );
            canvas.add(line);
        }
    });
    canvas.renderAll();
}

function savePolygons() {
    if (!currentProject || !currentCamera) return;
    const originalPolygons = polygons.map(poly => poly.map(([x, y]) => [x / currentScale, y / currentScale]));
    fetch('/save_polygons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_name: currentProject, camera_name: currentCamera, polygons: originalPolygons })
    });
}

function clearPolygons() {
    polygons = [];
    currentPolygon = [];
    drawPolygons();
}

function toggleCorrectionMode() {
    correctionMode = !correctionMode;
    console.log('Modo corrección:', correctionMode);
    drawPolygons();
}

function exportProject() {
    if (!currentProject) return;
    fetch('/export_project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_name: currentProject })
    })
    .then(response => response.blob())
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentProject}.zip`;
        a.click();
    });
}

function importProject() {
    const file = document.getElementById('importProjectInput').files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('project_zip', file);
    formData.append('project_name', file.name.replace('.zip', ''));

    fetch('/import_project', {
        method: 'POST',
        body: formData
    })
    .then(() => {
        loadProjects();
    });
}

document.addEventListener('keydown', (e) => {
    if (!correctionMode && e.ctrlKey && e.key === 'z' && currentPolygon.length > 0) {
        currentPolygon.pop();
        drawPolygons();
    }
    if (e.key === 'i') savePolygons();
    if (e.key === 'b') clearPolygons();
    if (e.key === 'r') toggleCorrectionMode();
    if (e.key === 'Delete' && correctionMode && selectedPoint) {
        const [polyIdx, pointIdx] = selectedPoint;
        polygons[polyIdx].splice(pointIdx, 1);
        drawPolygons();
        selectedPoint = null;
    }
});

window.onload = loadProjects;