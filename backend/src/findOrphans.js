"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var supabase_js_1 = require("@supabase/supabase-js");
var dotenv = __importStar(require("dotenv"));
var path_1 = __importDefault(require("path"));
dotenv.config({ path: path_1.default.resolve(__dirname, '../../frontend/.env') });
var supabaseUrl = process.env.VITE_SUPABASE_URL;
var supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
var supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
function findOrphans() {
    return __awaiter(this, void 0, void 0, function () {
        var poNumber, movements, grnIds, grns, existingGrnIds_1, orphanedGrnIds, _loop_1, _i, orphanedGrnIds_1, orphanedId, err_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 4, , 5]);
                    poNumber = 'PO-20260612-4743';
                    return [4 /*yield*/, supabase
                            .from('stock_movements')
                            .select('*, batches(*)')
                            .eq('reference_type', 'GRN')
                            .order('created_at', { ascending: false })
                            .limit(50)];
                case 1:
                    movements = (_a.sent()).data;
                    console.log("Found ".concat(movements === null || movements === void 0 ? void 0 : movements.length, " recent GRN stock movements."));
                    if (!(movements && movements.length > 0)) return [3 /*break*/, 3];
                    grnIds = __spreadArray([], new Set(movements.map(function (m) { return m.reference_id; }).filter(function (id) { return id != null; })), true);
                    return [4 /*yield*/, supabase
                            .from('grns')
                            .select('id, po_id')
                            .in('id', grnIds)];
                case 2:
                    grns = (_a.sent()).data;
                    existingGrnIds_1 = new Set(grns === null || grns === void 0 ? void 0 : grns.map(function (g) { return g.id; }));
                    orphanedGrnIds = grnIds.filter(function (id) { return !existingGrnIds_1.has(id); });
                    console.log('Orphaned GRN IDs in stock_movements:', orphanedGrnIds);
                    _loop_1 = function (orphanedId) {
                        var orphanedMovements = movements.filter(function (m) { return m.reference_id === orphanedId; });
                        console.log("\nMovements for Orphaned GRN ".concat(orphanedId, ":"));
                        orphanedMovements.forEach(function (m) {
                            console.log("  Movement ".concat(m.movement_number, " - Batch ").concat(m.batch_id, " - Qty ").concat(m.quantity, " - Cost ").concat(m.cost_price));
                            console.log("  Batch info: ".concat(JSON.stringify(m.batches)));
                        });
                    };
                    for (_i = 0, orphanedGrnIds_1 = orphanedGrnIds; _i < orphanedGrnIds_1.length; _i++) {
                        orphanedId = orphanedGrnIds_1[_i];
                        _loop_1(orphanedId);
                    }
                    _a.label = 3;
                case 3: return [3 /*break*/, 5];
                case 4:
                    err_1 = _a.sent();
                    console.error(err_1);
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
findOrphans();
