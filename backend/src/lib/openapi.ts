/**
 * Especificación OpenAPI 3.0 de la API /v1 que consume la app móvil (no incluye /v1/admin).
 * Es la fuente única del contrato: se sirve en GET /v1/openapi.json y se exporta a docs/openapi.json
 * con `npm run openapi:export`. tests/openapi.test.ts verifica que cubra todas las rutas de app.
 * Al cambiar una ruta de src/app/v1 (excepto admin), actualizar este archivo.
 */
export const openapi = {
  "openapi": "3.0.3",
  "info": {
    "title": "Lavi API (app móvil)",
    "version": "1.0.0",
    "description": "API `/v1` que consume la app móvil de adherencia NFC. El backend es la única fuente de reglas de negocio: la app envía las lecturas y muestra lo que este responde.\n\n**Errores**: todos los errores tienen el formato `{ \"error\": { \"code\", \"message\", ...extras } }`. La app muestra `message` y registra `code`.\n\n**Sesión**: `POST /v1/auth/session` canjea el token de la Customer Account API de Shopify por un token de acceso propio (`Authorization: Bearer`) y un token de renovación. Ante `401` se llama a `POST /v1/auth/refresh` una sola vez.\n\nEsta especificación vive en `backend/src/lib/openapi.ts`; `docs/openapi.json` se genera con `npm run openapi:export` y una prueba verifica que cubra todas las rutas de app de `src/app/v1`."
  },
  "servers": [
    {
      "url": "/",
      "description": "Mismo origen del backend (APP_BASE_URL)"
    }
  ],
  "security": [
    {
      "bearerAuth": []
    }
  ],
  "paths": {
    "/v1/config/app": {
      "get": {
        "operationId": "getAppConfig",
        "security": [],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/AppConfig"
                }
              }
            }
          }
        },
        "tags": [
          "Configuración"
        ],
        "summary": "Configuración de la app",
        "description": "Versión mínima, textos de notificaciones, ajustes globales y enlaces de tienda. Pública y cacheable."
      }
    },
    "/v1/auth/session": {
      "post": {
        "operationId": "createSession",
        "security": [],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/CreateSessionRequest"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Session"
                }
              }
            }
          },
          "400": {
            "$ref": "#/components/responses/Error"
          },
          "401": {
            "$ref": "#/components/responses/Error"
          },
          "403": {
            "$ref": "#/components/responses/Error"
          }
        },
        "tags": [
          "Sesión"
        ],
        "summary": "Iniciar sesión con Shopify",
        "description": "Valida el token de la Customer Account API, crea o actualiza la usuaria por `shopify_customer_id` y emite la sesión propia."
      },
      "delete": {
        "operationId": "deleteSession",
        "parameters": [
          {
            "name": "X-Refresh-Token",
            "in": "header",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "204": {
            "description": "Sesión cerrada"
          },
          "400": {
            "$ref": "#/components/responses/Error"
          },
          "401": {
            "$ref": "#/components/responses/Error"
          }
        },
        "tags": [
          "Sesión"
        ],
        "summary": "Cerrar sesión",
        "description": "Revoca el token de renovación enviado en `X-Refresh-Token`."
      }
    },
    "/v1/auth/refresh": {
      "post": {
        "operationId": "refreshSession",
        "security": [],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "refresh_token"
                ],
                "properties": {
                  "refresh_token": {
                    "type": "string"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Tokens"
                }
              }
            }
          },
          "400": {
            "$ref": "#/components/responses/Error"
          },
          "401": {
            "$ref": "#/components/responses/Error"
          }
        },
        "tags": [
          "Sesión"
        ],
        "summary": "Renovar tokens",
        "description": "Rota el token de renovación: el anterior queda revocado."
      }
    },
    "/v1/devices": {
      "post": {
        "operationId": "registerDevice",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/RegisterDeviceRequest"
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Creado",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": [
                    "id"
                  ],
                  "properties": {
                    "id": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          },
          "400": {
            "$ref": "#/components/responses/Error"
          },
          "401": {
            "$ref": "#/components/responses/Error"
          }
        },
        "tags": [
          "Dispositivos"
        ],
        "summary": "Registrar dispositivo para push",
        "description": "Registra (o reasigna a esta usuaria) el token de Expo para el push de respaldo."
      }
    },
    "/v1/devices/{id}": {
      "delete": {
        "operationId": "deleteDevice",
        "parameters": [
          {
            "$ref": "#/components/parameters/Id"
          }
        ],
        "responses": {
          "204": {
            "description": "Eliminado"
          },
          "401": {
            "$ref": "#/components/responses/Error"
          }
        },
        "tags": [
          "Dispositivos"
        ],
        "summary": "Eliminar dispositivo",
        "description": "Al cerrar sesión."
      }
    },
    "/v1/me": {
      "get": {
        "operationId": "getMe",
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Me"
                }
              }
            }
          },
          "401": {
            "$ref": "#/components/responses/Error"
          }
        },
        "tags": [
          "Perfil"
        ],
        "summary": "Perfil y saldo"
      },
      "patch": {
        "operationId": "updateMe",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/UpdateMeRequest"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Me"
                }
              }
            }
          },
          "400": {
            "$ref": "#/components/responses/Error"
          },
          "401": {
            "$ref": "#/components/responses/Error"
          }
        },
        "tags": [
          "Perfil"
        ],
        "summary": "Actualizar perfil",
        "description": "Nombre, zona horaria (IANA) y aceptación de la política de datos."
      },
      "delete": {
        "operationId": "deleteMe",
        "responses": {
          "204": {
            "description": "Cuenta eliminada"
          },
          "401": {
            "$ref": "#/components/responses/Error"
          }
        },
        "tags": [
          "Perfil"
        ],
        "summary": "Eliminar cuenta",
        "description": "Elimina la cuenta y los datos personales (exigido por Apple). Se pierden los puntos."
      }
    },
    "/v1/scans": {
      "post": {
        "operationId": "createScan",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/ScanRequest"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ScanResponse"
                }
              }
            }
          },
          "400": {
            "$ref": "#/components/responses/Error"
          },
          "401": {
            "$ref": "#/components/responses/Error"
          }
        },
        "tags": [
          "Lecturas"
        ],
        "summary": "Registrar una lectura del tag",
        "description": "Punto único de toda lectura. El backend verifica en orden: firma y contador → tag bloqueado → tag reclamado → es de esta clienta → ventana abierta, y se detiene en el primero que falla. Siempre responde 200 con un `result`; los rechazos son `result: \"rejected\"` con `reason`. Una lectura sin conexión (`offline: true`) se evalúa con `device_time`. Reenviar la misma lectura devuelve la respuesta guardada (`idempotent_replay: true`)."
      }
    },
    "/v1/treatments": {
      "get": {
        "operationId": "listTreatments",
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": [
                    "treatments"
                  ],
                  "properties": {
                    "treatments": {
                      "type": "array",
                      "items": {
                        "$ref": "#/components/schemas/TreatmentSummary"
                      }
                    }
                  }
                }
              }
            }
          },
          "401": {
            "$ref": "#/components/responses/Error"
          }
        },
        "tags": [
          "Tratamientos"
        ],
        "summary": "Listar tratamientos",
        "description": "Del más reciente al más antiguo, sin dosis."
      },
      "post": {
        "operationId": "activateTreatment",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/ActivateTreatmentRequest"
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Creado",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Treatment"
                }
              }
            }
          },
          "400": {
            "$ref": "#/components/responses/Error"
          },
          "401": {
            "$ref": "#/components/responses/Error"
          },
          "403": {
            "$ref": "#/components/responses/Error"
          },
          "409": {
            "$ref": "#/components/responses/Error"
          }
        },
        "tags": [
          "Tratamientos"
        ],
        "summary": "Activar un frasco",
        "description": "Canjea el `activation_token` recibido en una lectura `activation_required`. Reclama el tag, crea el tratamiento con la configuración vigente y genera todas las dosis."
      }
    },
    "/v1/treatments/{id}": {
      "get": {
        "operationId": "getTreatment",
        "parameters": [
          {
            "$ref": "#/components/parameters/Id"
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Treatment"
                }
              }
            }
          },
          "401": {
            "$ref": "#/components/responses/Error"
          },
          "404": {
            "$ref": "#/components/responses/Error"
          }
        },
        "tags": [
          "Tratamientos"
        ],
        "summary": "Detalle de un tratamiento",
        "description": "Incluye todas las dosis y `config.reminder_nudges` para programar los recordatorios locales."
      }
    },
    "/v1/treatments/{id}/schedule": {
      "patch": {
        "operationId": "changeSchedule",
        "parameters": [
          {
            "$ref": "#/components/parameters/Id"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/ChangeScheduleRequest"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Treatment"
                }
              }
            }
          },
          "400": {
            "$ref": "#/components/responses/Error"
          },
          "401": {
            "$ref": "#/components/responses/Error"
          },
          "404": {
            "$ref": "#/components/responses/Error"
          },
          "409": {
            "$ref": "#/components/responses/Error"
          }
        },
        "tags": [
          "Tratamientos"
        ],
        "summary": "Cambiar horarios",
        "description": "Regenera solo las dosis programadas que empiezan después del aviso mínimo (`schedule_change_min_notice_hours`)."
      }
    },
    "/v1/points": {
      "get": {
        "operationId": "getPoints",
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Points"
                }
              }
            }
          },
          "401": {
            "$ref": "#/components/responses/Error"
          }
        },
        "tags": [
          "Puntos"
        ],
        "summary": "Saldo y próximos vencimientos"
      }
    },
    "/v1/points/ledger": {
      "get": {
        "operationId": "listLedger",
        "parameters": [
          {
            "name": "limit",
            "in": "query",
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 100,
              "default": 30
            }
          },
          {
            "name": "before",
            "in": "query",
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/LedgerPage"
                }
              }
            }
          },
          "400": {
            "$ref": "#/components/responses/Error"
          },
          "401": {
            "$ref": "#/components/responses/Error"
          }
        },
        "tags": [
          "Puntos"
        ],
        "summary": "Movimientos de puntos",
        "description": "Paginado hacia atrás: enviar `next_before` como `before`."
      }
    },
    "/v1/redemptions/options": {
      "get": {
        "operationId": "listRedemptionOptions",
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/RedemptionOptions"
                }
              }
            }
          },
          "401": {
            "$ref": "#/components/responses/Error"
          }
        },
        "tags": [
          "Canjes"
        ],
        "summary": "Opciones de canje",
        "description": "Incluye el saldo y si cada opción es alcanzable (`affordable`)."
      }
    },
    "/v1/redemptions": {
      "get": {
        "operationId": "listRedemptions",
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": [
                    "redemptions"
                  ],
                  "properties": {
                    "redemptions": {
                      "type": "array",
                      "items": {
                        "$ref": "#/components/schemas/Redemption"
                      }
                    }
                  }
                }
              }
            }
          },
          "401": {
            "$ref": "#/components/responses/Error"
          }
        },
        "tags": [
          "Canjes"
        ],
        "summary": "Mis canjes y códigos",
        "description": "Últimos 100. `code` solo se muestra en estado `issued` o `used`."
      },
      "post": {
        "operationId": "createRedemption",
        "parameters": [
          {
            "name": "Idempotency-Key",
            "in": "header",
            "required": true,
            "schema": {
              "type": "string",
              "minLength": 8,
              "maxLength": 128
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "option_id"
                ],
                "properties": {
                  "option_id": {
                    "type": "string",
                    "format": "uuid"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Creado",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Redemption"
                }
              }
            }
          },
          "400": {
            "$ref": "#/components/responses/Error"
          },
          "401": {
            "$ref": "#/components/responses/Error"
          },
          "404": {
            "$ref": "#/components/responses/Error"
          },
          "409": {
            "$ref": "#/components/responses/Error"
          },
          "502": {
            "$ref": "#/components/responses/Error"
          }
        },
        "tags": [
          "Canjes"
        ],
        "summary": "Canjear puntos",
        "description": "Descuenta los puntos y crea un código de un solo uso en Shopify. Idempotente por `Idempotency-Key`: repetir la petición devuelve el mismo resultado sin cobrar dos veces. Si Shopify falla los puntos se devuelven (`502`)."
      }
    }
  },
  "components": {
    "securitySchemes": {
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer"
      }
    },
    "parameters": {
      "Id": {
        "name": "id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    },
    "responses": {
      "Error": {
        "description": "Error con el formato { error: { code, message } }",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/ApiError"
            }
          }
        }
      }
    },
    "schemas": {
      "ApiError": {
        "type": "object",
        "required": [
          "error"
        ],
        "properties": {
          "error": {
            "type": "object",
            "required": [
              "code",
              "message"
            ],
            "additionalProperties": true,
            "properties": {
              "code": {
                "type": "string"
              },
              "message": {
                "type": "string"
              }
            },
            "description": "Códigos usados por la app: validation_error, invalid_json, unauthorized, token_expired, invalid_refresh_token, account_unavailable, account_blocked, invalid_shopify_token, missing_refresh_token, missing_idempotency_key, activation_token_invalid, activation_token_mismatch, tag_not_found, tag_already_claimed, tag_blocked, active_treatment_exists, variant_not_configured, invalid_times, times_overlap, invalid_start_date, no_doses, treatment_not_found, treatment_not_active, schedule_unchanged, schedule_change_limit, option_not_found, below_minimum, insufficient_points, request_in_progress, shopify_unavailable, shopify_discount_failed, internal_error. `schedule_change_limit` agrega `max_count` y `period_days`."
          }
        }
      },
      "AppConfig": {
        "type": "object",
        "required": [
          "min_app_version"
        ],
        "properties": {
          "min_app_version": {
            "type": "string",
            "example": "1.0.0"
          },
          "notification_texts": {
            "type": "object",
            "additionalProperties": {
              "type": "string"
            },
            "description": "Claves: reminder_title, reminder_body, nudge_body, backup_title, backup_body, repurchase_title, repurchase_body. Admiten {product}."
          },
          "settings": {
            "type": "object",
            "properties": {
              "point_value_cop": {
                "type": "number"
              },
              "min_points_to_redeem": {
                "type": "integer"
              },
              "points_expiration_days": {
                "type": "integer"
              },
              "offline_scan_max_hours": {
                "type": "integer"
              },
              "allow_parallel_treatments": {
                "type": "boolean"
              }
            }
          },
          "links": {
            "type": "object",
            "properties": {
              "ios_store_url": {
                "type": "string"
              },
              "android_store_url": {
                "type": "string"
              },
              "app_domain": {
                "type": "string"
              }
            }
          }
        }
      },
      "CreateSessionRequest": {
        "type": "object",
        "required": [
          "shopify_access_token"
        ],
        "properties": {
          "shopify_access_token": {
            "type": "string"
          },
          "timezone": {
            "type": "string"
          },
          "data_consent": {
            "type": "boolean"
          }
        }
      },
      "Tokens": {
        "type": "object",
        "required": [
          "access_token",
          "refresh_token"
        ],
        "properties": {
          "access_token": {
            "type": "string"
          },
          "refresh_token": {
            "type": "string"
          },
          "expires_in": {
            "type": "integer"
          }
        }
      },
      "Session": {
        "allOf": [
          {
            "$ref": "#/components/schemas/Tokens"
          },
          {
            "type": "object",
            "required": [
              "user_id",
              "needs_data_consent"
            ],
            "properties": {
              "user_id": {
                "type": "string",
                "format": "uuid"
              },
              "needs_data_consent": {
                "type": "boolean"
              }
            }
          }
        ]
      },
      "RegisterDeviceRequest": {
        "type": "object",
        "required": [
          "push_token",
          "platform"
        ],
        "properties": {
          "push_token": {
            "type": "string"
          },
          "platform": {
            "type": "string",
            "enum": [
              "ios",
              "android"
            ]
          }
        }
      },
      "Me": {
        "type": "object",
        "required": [
          "id",
          "timezone",
          "balance"
        ],
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "email": {
            "type": "string",
            "nullable": true
          },
          "name": {
            "type": "string",
            "nullable": true
          },
          "phone": {
            "type": "string",
            "nullable": true
          },
          "timezone": {
            "type": "string",
            "example": "America/Bogota"
          },
          "data_consent_at": {
            "type": "string",
            "format": "date-time",
            "nullable": true
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          },
          "balance": {
            "type": "integer"
          }
        }
      },
      "UpdateMeRequest": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string"
          },
          "timezone": {
            "type": "string"
          },
          "accept_data_policy": {
            "type": "boolean",
            "enum": [
              true
            ]
          }
        }
      },
      "Product": {
        "type": "object",
        "required": [
          "id",
          "name"
        ],
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "name": {
            "type": "string"
          }
        }
      },
      "Variant": {
        "type": "object",
        "required": [
          "id",
          "name"
        ],
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "name": {
            "type": "string"
          },
          "volume_ml": {
            "type": "integer",
            "nullable": true
          },
          "shopify_variant_id": {
            "type": "string",
            "nullable": true,
            "description": "Id de la variante en Shopify (numérico o GID)"
          }
        }
      },
      "DoseWindow": {
        "type": "object",
        "required": [
          "id",
          "window_start",
          "window_end"
        ],
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "window_start": {
            "type": "string",
            "format": "date-time"
          },
          "window_end": {
            "type": "string",
            "format": "date-time"
          }
        }
      },
      "Dose": {
        "type": "object",
        "required": [
          "id",
          "window_start",
          "window_end",
          "status"
        ],
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "window_start": {
            "type": "string",
            "format": "date-time"
          },
          "window_end": {
            "type": "string",
            "format": "date-time"
          },
          "status": {
            "type": "string",
            "enum": [
              "scheduled",
              "on_time",
              "late",
              "missed"
            ]
          },
          "recorded_at": {
            "type": "string",
            "format": "date-time",
            "nullable": true
          }
        }
      },
      "TreatmentConfig": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "version": {
            "type": "integer"
          },
          "doses_per_day": {
            "type": "integer"
          },
          "duration_days": {
            "type": "integer"
          },
          "points_per_dose": {
            "type": "integer"
          },
          "window_minutes_before": {
            "type": "integer"
          },
          "window_minutes_after": {
            "type": "integer"
          },
          "reminder_nudges": {
            "type": "array",
            "items": {
              "type": "integer"
            },
            "description": "Minutos desde la apertura de la ventana en que se insiste"
          },
          "schedule_change_min_notice_hours": {
            "type": "integer"
          },
          "schedule_change_max_count": {
            "type": "integer"
          },
          "schedule_change_period_days": {
            "type": "integer"
          }
        }
      },
      "TreatmentSummary": {
        "type": "object",
        "required": [
          "id",
          "status",
          "product",
          "variant",
          "reminder_times",
          "start_date",
          "end_date",
          "progress",
          "schedule_changes_left",
          "days_left",
          "repurchase_suggested"
        ],
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "tag_uid": {
            "type": "string",
            "description": "UID del tag NFC (hex)"
          },
          "status": {
            "type": "string",
            "enum": [
              "active",
              "finished",
              "cancelled"
            ]
          },
          "start_date": {
            "type": "string",
            "format": "date"
          },
          "end_date": {
            "type": "string",
            "format": "date"
          },
          "reminder_times": {
            "type": "array",
            "items": {
              "type": "string",
              "example": "08:00"
            }
          },
          "points_earned": {
            "type": "integer"
          },
          "product": {
            "$ref": "#/components/schemas/Product"
          },
          "variant": {
            "$ref": "#/components/schemas/Variant"
          },
          "config": {
            "$ref": "#/components/schemas/TreatmentConfig"
          },
          "progress": {
            "type": "object",
            "required": [
              "total",
              "on_time",
              "late",
              "missed"
            ],
            "properties": {
              "total": {
                "type": "integer"
              },
              "on_time": {
                "type": "integer"
              },
              "late": {
                "type": "integer"
              },
              "missed": {
                "type": "integer"
              }
            }
          },
          "schedule_changes_left": {
            "type": "integer"
          },
          "days_left": {
            "type": "integer"
          },
          "repurchase_suggested": {
            "type": "boolean"
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          },
          "finished_at": {
            "type": "string",
            "format": "date-time",
            "nullable": true
          }
        }
      },
      "Treatment": {
        "allOf": [
          {
            "$ref": "#/components/schemas/TreatmentSummary"
          },
          {
            "type": "object",
            "required": [
              "doses"
            ],
            "properties": {
              "doses": {
                "type": "array",
                "items": {
                  "$ref": "#/components/schemas/Dose"
                }
              }
            }
          }
        ]
      },
      "ActivateTreatmentRequest": {
        "type": "object",
        "required": [
          "activation_token"
        ],
        "properties": {
          "activation_token": {
            "type": "string"
          },
          "reminder_times": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "start_date": {
            "type": "string",
            "format": "date"
          }
        }
      },
      "ChangeScheduleRequest": {
        "type": "object",
        "required": [
          "reminder_times"
        ],
        "properties": {
          "reminder_times": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "string"
            }
          }
        }
      },
      "ScanRequest": {
        "type": "object",
        "required": [
          "tag_url"
        ],
        "properties": {
          "tag_url": {
            "type": "string"
          },
          "device_time": {
            "type": "string",
            "format": "date-time",
            "description": "ISO 8601 con zona"
          },
          "offline": {
            "type": "boolean"
          }
        }
      },
      "ScanResponse": {
        "type": "object",
        "required": [
          "result"
        ],
        "properties": {
          "result": {
            "type": "string",
            "enum": [
              "activation_required",
              "dose_recorded",
              "too_early",
              "late",
              "no_pending_dose",
              "treatment_finished",
              "rejected"
            ]
          },
          "reason": {
            "type": "string",
            "enum": [
              "invalid_signature",
              "replayed",
              "owned_by_other",
              "blocked",
              "offline_expired"
            ]
          },
          "idempotent_replay": {
            "type": "boolean"
          },
          "activation_token": {
            "type": "string"
          },
          "expires_in": {
            "type": "integer"
          },
          "product": {
            "$ref": "#/components/schemas/Product"
          },
          "variant": {
            "$ref": "#/components/schemas/Variant"
          },
          "suggested_times": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "config": {
            "$ref": "#/components/schemas/TreatmentConfig"
          },
          "dose_id": {
            "type": "string"
          },
          "points_earned": {
            "type": "integer"
          },
          "bonus_points": {
            "type": "integer"
          },
          "streak": {
            "type": "integer"
          },
          "balance": {
            "type": "integer"
          },
          "next_dose": {
            "type": "object",
            "allOf": [
              {
                "$ref": "#/components/schemas/DoseWindow"
              }
            ],
            "nullable": true
          },
          "treatment_completed": {
            "type": "boolean"
          },
          "opens_at": {
            "type": "string",
            "format": "date-time"
          },
          "window_end": {
            "type": "string",
            "format": "date-time"
          },
          "treatment_id": {
            "type": "string",
            "nullable": true
          },
          "repurchase_suggested": {
            "type": "boolean"
          }
        },
        "description": "Cuerpo según `result`:\n- `activation_required`: `activation_token`, `expires_in`, `product`, `variant`, `suggested_times`, `config`.\n- `dose_recorded`: `dose_id`, `points_earned`, `bonus_points`, `streak`, `balance`, `next_dose`, `treatment_completed`.\n- `too_early`: `opens_at`, `window_end`, `dose_id`.\n- `late`: `dose_id`, `points_earned` (0), `balance`, `next_dose`, `treatment_completed`.\n- `no_pending_dose`: `next_dose` (puede ser `null`).\n- `treatment_finished`: `treatment_id`, `repurchase_suggested`.\n- `rejected`: `reason`.\n\nLos clientes deben tolerar valores de `result` que no conozcan."
      },
      "Points": {
        "type": "object",
        "required": [
          "balance"
        ],
        "properties": {
          "balance": {
            "type": "integer"
          },
          "value_cop": {
            "type": "number"
          },
          "upcoming_expirations": {
            "type": "array",
            "items": {
              "type": "object",
              "required": [
                "date",
                "amount"
              ],
              "properties": {
                "date": {
                  "type": "string",
                  "format": "date"
                },
                "amount": {
                  "type": "integer"
                }
              }
            }
          }
        }
      },
      "LedgerEntry": {
        "type": "object",
        "required": [
          "id",
          "amount",
          "reason",
          "created_at"
        ],
        "properties": {
          "id": {
            "type": "string",
            "description": "Entero de 64 bits como texto"
          },
          "amount": {
            "type": "integer",
            "description": "Positivo abona, negativo descuenta"
          },
          "reason": {
            "type": "string"
          },
          "reference_type": {
            "type": "string",
            "nullable": true
          },
          "expires_at": {
            "type": "string",
            "format": "date-time",
            "nullable": true
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          }
        }
      },
      "LedgerPage": {
        "type": "object",
        "required": [
          "entries"
        ],
        "properties": {
          "entries": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/LedgerEntry"
            }
          },
          "next_before": {
            "type": "string",
            "nullable": true
          }
        }
      },
      "RedemptionOption": {
        "type": "object",
        "required": [
          "id",
          "name",
          "points_cost",
          "reward_type",
          "affordable"
        ],
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "name": {
            "type": "string"
          },
          "points_cost": {
            "type": "integer"
          },
          "reward_type": {
            "type": "string",
            "enum": [
              "fixed_amount",
              "percentage",
              "free_product",
              "free_shipping"
            ]
          },
          "reward_value": {
            "type": "number",
            "nullable": true
          },
          "affordable": {
            "type": "boolean"
          }
        }
      },
      "RedemptionOptions": {
        "type": "object",
        "required": [
          "balance",
          "min_points_to_redeem",
          "options"
        ],
        "properties": {
          "balance": {
            "type": "integer"
          },
          "min_points_to_redeem": {
            "type": "integer"
          },
          "options": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/RedemptionOption"
            }
          }
        }
      },
      "Redemption": {
        "type": "object",
        "required": [
          "id",
          "option_id",
          "option_name",
          "status",
          "points",
          "created_at"
        ],
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "option_id": {
            "type": "string",
            "format": "uuid"
          },
          "option_name": {
            "type": "string"
          },
          "reward_type": {
            "type": "string"
          },
          "points": {
            "type": "integer"
          },
          "code": {
            "type": "string",
            "nullable": true
          },
          "status": {
            "type": "string",
            "enum": [
              "pending",
              "issued",
              "used",
              "expired",
              "failed"
            ]
          },
          "expires_at": {
            "type": "string",
            "format": "date-time",
            "nullable": true
          },
          "used_at": {
            "type": "string",
            "format": "date-time",
            "nullable": true
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          }
        }
      }
    }
  },
  "tags": [
    {
      "name": "Configuración",
      "description": "Versión mínima, textos y enlaces."
    },
    {
      "name": "Sesión",
      "description": "Inicio de sesión con Shopify y renovación de tokens."
    },
    {
      "name": "Dispositivos",
      "description": "Token de push de respaldo."
    },
    {
      "name": "Perfil",
      "description": "Datos de la clienta, saldo y eliminación de cuenta."
    },
    {
      "name": "Lecturas",
      "description": "Lectura del tag NFC; el backend decide el resultado."
    },
    {
      "name": "Tratamientos",
      "description": "Activación, dosis y horarios."
    },
    {
      "name": "Puntos",
      "description": "Saldo, vencimientos y movimientos."
    },
    {
      "name": "Canjes",
      "description": "Opciones, canje y códigos de descuento."
    }
  ]
} as const;
