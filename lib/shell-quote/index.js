// Vendored copy of shell-quote@1.8.3.
// Kept local because the package firewall blocks the registry package.

'use strict';

exports.quote = function quote(xs) {
    return xs.map(function (s) {
        if (s && typeof s === 'object') {
            return s.op.replace(/(.)/g, '\\$1');
        }
        if (/[^A-Za-z0-9_\-.,:\/@\n%+]/.test(s)) {
            return "'" + s.replace(/'/g, "'\\''") + "'";
        }
        return s || "''";
    }).join(' ');
};

var defined = function (env, key) {
    return env[key] !== undefined;
};

exports.parse = function parse(s, env, opts) {
    var envc = typeof env === 'function' ? env : function (key) {
        return defined(env, key) ? env[key] : undefined;
    };
    if (typeof env === 'object' && !opts) {
        opts = {};
    }
    opts = opts || {};

    var chunker = /(#[^\n]*)|(\\.)|(["'])(?:(?!\3)[^\\]|\\.)*?\3|(\S+)/gs;
    var match;
    var words = [];
    var s2 = s;
    chunker.lastIndex = 0;

    while ((match = chunker.exec(s2))) {
        if (match[1]) continue;

        var token;
        if (match[2]) {
            token = match[2].slice(1);
        } else if (match[3]) {
            var quote = match[3];
            var inner = match[0].slice(1, -1);
            if (quote === "'") {
                token = inner;
            } else {
                token = inner.replace(/\\([$`"\\])/g, '$1').replace(
                    /\$([a-zA-Z_][a-zA-Z0-9_]*|\{[^}]+\})/g,
                    function (_, key) {
                        var k = key.charAt(0) === '{' ? key.slice(1, -1) : key;
                        var val = typeof env === 'function'
                            ? envc(k)
                            : (defined(env, k) ? env[k] : undefined);
                        return val === undefined ? (opts.operator ? { op: '\\$' + key } : '$' + key) : val;
                    }
                );
            }
        } else if (match[4]) {
            var raw = match[4];
            if (/^(&&|\|\||;;|<<|>>|[|><&;()])/.test(raw)) {
                var op = raw.match(/^(&&|\|\||;;|<<|>>|[|><&;()])/)[1];
                words.push({ op: op });
                var rest = raw.slice(op.length);
                if (rest) {
                    s2 = rest + s2.slice(chunker.lastIndex);
                    chunker.lastIndex = 0;
                }
                continue;
            }
            token = raw.replace(
                /\$([a-zA-Z_][a-zA-Z0-9_]*|\{[^}]+\})/g,
                function (_, key) {
                    var k = key.charAt(0) === '{' ? key.slice(1, -1) : key;
                    var val = typeof env === 'function'
                        ? envc(k)
                        : (env && defined(env, k) ? env[k] : undefined);
                    return val === undefined ? '$' + key : val;
                }
            );
        } else {
            continue;
        }

        words.push(token);
    }

    return words;
};