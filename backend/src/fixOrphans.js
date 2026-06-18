"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
var supabase_js_1 = require("@supabase/supabase-js");
var dotenv = require("dotenv");
var path_1 = require("path");
dotenv.config({ path: path_1.default.resolve(__dirname, '../../frontend/.env') });
var supabaseUrl = process.env.VITE_SUPABASE_URL;
var supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
var supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
function fixOrphans() {
    return __awaiter(this, void 0, void 0, function () {
        var movements, grnIds, uniqueGrnIds, grns, existingIds_1, orphanedGrnIds, orphanedBatchIds, _loop_1, _i, orphanedGrnIds_1, orphanedId, _a, orphanedBatchIds_1, batchId, otherMoves, err_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 13, , 14]);
                    return [4 /*yield*/, supabase
                            .from('stock_movements')
                            .select('id, batch_id, reference_id, quantity')
                            .eq('reference_type', 'GRN')];
                case 1:
                    movements = (_b.sent()).data;
                    if (!movements)
                        return [2 /*return*/];
                    grnIds = movements.map(function (m) { return m.reference_id; }).filter(function (id) { return id; });
                    uniqueGrnIds = grnIds.filter(function (v, i, a) { return a.indexOf(v) === i; });
                    return [4 /*yield*/, supabase
                            .from('grns')
                            .select('id')
                            .in('id', uniqueGrnIds)];
                case 2:
                    grns = (_b.sent()).data;
                    existingIds_1 = (grns || []).map(function (g) { return g.id; });
                    orphanedGrnIds = uniqueGrnIds.filter(function (id) { return !existingIds_1.includes(id); });
                    console.log('Orphaned GRN IDs:', orphanedGrnIds);
                    orphanedBatchIds = [];
                    _loop_1 = function (orphanedId) {
                        var orphanedMovements, _c, orphanedMovements_1, m;
                        return __generator(this, function (_d) {
                            switch (_d.label) {
                                case 0:
                                    orphanedMovements = movements.filter(function (m) { return m.reference_id === orphanedId; });
                                    console.log("\nDeleting movements for Orphaned GRN ".concat(orphanedId, "..."));
                                    _c = 0, orphanedMovements_1 = orphanedMovements;
                                    _d.label = 1;
                                case 1:
                                    if (!(_c < orphanedMovements_1.length)) return [3 /*break*/, 4];
                                    m = orphanedMovements_1[_c];
                                    if (m.batch_id)
                                        orphanedBatchIds.push(m.batch_id);
                                    // Delete movement
                                    return [4 /*yield*/, supabase.from('stock_movements').delete().eq('id', m.id)];
                                case 2:
                                    // Delete movement
                                    _d.sent();
                                    _d.label = 3;
                                case 3:
                                    _c++;
                                    return [3 /*break*/, 1];
                                case 4: return [2 /*return*/];
                            }
                        });
                    };
                    _i = 0, orphanedGrnIds_1 = orphanedGrnIds;
                    _b.label = 3;
                case 3:
                    if (!(_i < orphanedGrnIds_1.length)) return [3 /*break*/, 6];
                    orphanedId = orphanedGrnIds_1[_i];
                    return [5 /*yield**/, _loop_1(orphanedId)];
                case 4:
                    _b.sent();
                    _b.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 3];
                case 6:
                    // unique batch ids
                    orphanedBatchIds = orphanedBatchIds.filter(function (v, i, a) { return a.indexOf(v) === i; });
                    _a = 0, orphanedBatchIds_1 = orphanedBatchIds;
                    _b.label = 7;
                case 7:
                    if (!(_a < orphanedBatchIds_1.length)) return [3 /*break*/, 12];
                    batchId = orphanedBatchIds_1[_a];
                    return [4 /*yield*/, supabase.from('stock_movements').select('id').eq('batch_id', batchId)];
                case 8:
                    otherMoves = (_b.sent()).data;
                    if (!(!otherMoves || otherMoves.length === 0)) return [3 /*break*/, 10];
                    console.log("Deleting orphaned batch ".concat(batchId));
                    return [4 /*yield*/, supabase.from('batches').delete().eq('id', batchId)];
                case 9:
                    _b.sent();
                    return [3 /*break*/, 11];
                case 10:
                    console.log("Batch ".concat(batchId, " has OTHER movements, manually check!"));
                    _b.label = 11;
                case 11:
                    _a++;
                    return [3 /*break*/, 7];
                case 12:
                    console.log('Done!');
                    return [3 /*break*/, 14];
                case 13:
                    err_1 = _b.sent();
                    console.error(err_1);
                    return [3 /*break*/, 14];
                case 14: return [2 /*return*/];
            }
        });
    });
}
fixOrphans();
