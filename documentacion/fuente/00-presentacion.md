# Presentación

**CAPEAR Gestión** es una aplicación web de escritorio desarrollada en el marco de las Prácticas Profesionalizantes para **Rectificaciones CAPEAR**, un taller de rectificación de motores. Resuelve el principal cuello de botella de la empresa, la confección de presupuestos, y lo conecta con el seguimiento de los trabajos en el taller: clientes, motores, catálogo tipificado de mano de obra, repuestos, ensayos y servicios, presupuestos con cálculo automático, decisión del cliente, creación automática de la orden de trabajo y su seguimiento por islas, piezas y fotos.

El proyecto se desarrolló entre agosto y noviembre de 2026. Partió de un relevamiento con la empresa y de un prototipo navegable, incorporó una base de datos real con autenticación y control de acceso por rol, se amplió con cuatro sprints surgidos de los pedidos de la empresa y, desde el 12/11/2026, funciona en producción para la empresa.

## Contenido de este documento

Este documento reúne en un solo volumen los entregables escritos de la práctica:

| Parte | Contenido | Destinatario principal |
|---|---|---|
| **Parte I — Plan de Desarrollo de Software** | Requerimientos, alcance, roles, tareas (EDT), cronograma y diagrama de Gantt, riesgos y criterios de aceptación. | Docentes y equipo. |
| **Parte II — Manual del Usuario** | Uso de cada pantalla del sistema, paso a paso y con capturas de la aplicación. | Personal de CAPEAR. |
| **Parte III — Informe Técnico-Funcional del Desarrollador** | Funcionamiento, arquitectura, tecnologías, modelo de datos, seguridad, pruebas, instalación y despliegue. | Docentes y desarrolladores que mantengan el sistema. |

## Repositorio

La entrega se publica en el repositorio **Santyy08/capear-gestion** de GitHub: este documento en PDF y sus fuentes, la presentación web del proyecto, una muestra del código y la licencia. El código completo se mantiene en un repositorio privado de trabajo, protegido por la licencia comercial, y el sistema puede usarse en línea en su entorno de prueba. La carpeta `documentacion/` contiene este documento en PDF y, en `documentacion/fuente/`, sus partes en formato Markdown, las capturas y los programas que generan el diagrama de Gantt y el PDF.

## Licencia

CAPEAR Gestión es software propietario y se distribuye bajo la **Licencia Comercial de Valiora** (archivo `LICENSE` del repositorio): todos los derechos reservados. La licencia autoriza a los docentes y evaluadores de las Prácticas Profesionalizantes a acceder al sistema, ejecutarlo y revisarlo con el fin de evaluar la práctica, y a Rectificaciones CAPEAR a usarlo según su acuerdo comercial. Las bibliotecas de terceros conservan sus propias licencias.

## Convenciones

- Los nombres de botones, campos y pantallas se escriben entre comillas angulares, tal como aparecen en la aplicación: «Nuevo presupuesto».
- Las fechas se expresan en formato dd/mm/aaaa.
- Las reglas, decisiones y requerimientos se citan con un código (por ejemplo, BR-01, D-49 o RF-12), que se explica en el mismo documento.
- Todas las capturas se tomaron con datos ficticios de demostración; no contienen información real de la empresa ni de sus clientes.
