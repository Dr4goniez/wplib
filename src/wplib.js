/* global mw */
//<nowiki>
// =================================================================================================================

/**
 * @constructor
 */
var WPLib = function() {

    // For when the 'new' keyword is missing
    if (!(this instanceof WPLib)) {
        return new WPLib();
    }

};

WPLib.prototype = {

    /**
     * @private
     */
    defaultOptions: {
        parameters: {
            action: 'query',
            format: 'json',
            formatversion: '2'
        },
        ajax: {
            url: '/w/api.php',
            timeout: 30 * 1000, // 30 seconds
            dataType: 'json'
        }
    },

    /**
     * Whether the current user has the apihighlimits user right.
     * @property {boolean}
     */
    // @ts-ignore
    apiHighLimits: [].concat(mw.config.get('wgUserGroups'), mw.config.get('wgGlobalGroups')).some(function(group) {
        var apiHighLimitsUserGroups = [
            'bot',
            'sysop',
            'apihighlimits-requestor',
            'founder',
            'global-bot',
            'global-sysop',
            'staff',
            'steward',
            'sysadmin',
            'wmf-researcher'
        ];
        return apiHighLimitsUserGroups.indexOf(group) !== -1;
    }),

    // ============================================== SYNCHRONOUS METHODS ==============================================

    /**
     * Same as Object.assign in ES6. Merge obj2, 3, 4... into obj1. This method changes the original object.
     * @param {...object} objects Any number of objects
     * @returns {object|null} obj1 into which obj2, 3, 4... is merged
     */
    merge: function() {

        // Convert arguments to an array of arguments
        var args = [];
        for (var key in arguments) {
            args.push(arguments[key]);
        }

        // Type check
        var nonObjectIndex = [];
        args.forEach(function(obj, i) {
            if (typeof obj !== 'object') {
                nonObjectIndex.push(i + 1);
            }
        });
        if (nonObjectIndex.length !== 0) {
            console.error('TypeError: Arguments passed to merge() must all be objects (No. ' + nonObjectIndex.join(', ') + ').');
            return null;
        }

        // Ensure that two or more arguments are passed
        // (if the length is 1, the loop below isn't executed and just returns the original object back)
        if (args.length === 0) {
            console.error('ReferenceError: No argument is passed to merge().');
            return null;
        }

        // Merge
        var target = args[0];
        args.slice(1).forEach(function(obj) {
            for (var key in obj) {
                target[key] = obj[key];
            }
        });

        return target;

    },

    /**
     * Check whether two arrays are equal. Neither array should contain objects nor other arrays.
     * @param {Array<(boolean|string|number|undefined|null)>} array1 
     * @param {Array<(boolean|string|number|undefined|null)>} array2 
     * @param {boolean} [orderInsensitive] If true, ignore the order of elements
     * @returns {boolean|null}
     */
    arraysEqual: function(array1, array2, orderInsensitive) {

        if (!Array.isArray(array1) || !Array.isArray(array2)) {
            console.error('TypeError: The first and second arguments of arraysEqual() must be arrays.');
            return null;
        }

        orderInsensitive = typeof orderInsensitive !== 'undefined' ? orderInsensitive : false; 
        if (orderInsensitive) {
            return array1.length === array2.length && array1.every(function(el) {
                return array2.indexOf(el) !== -1;
            });
        } else {
            return array1.length === array2.length && array1.every(function(el, i) {
                return array2[i] === el;
            });
        }

    },

    /**
     * Concat arrays of API responses (especially those fetched by continuedQuery and massQuery) into one array. For example:
     * ```json
     *  [
     *      {
     *          "query": {
     *              "blocks": [{...}, {...}]
     *          }
     *      },
     *      {...}
     *  ]
     * ```
     * Pass 'blocks' to the second argument, then the function concats res.query.blocks arrays in every response object in the array
     * passed as the first argument. Note that concat targets must be at res.query[concatKey] level.
     * @param {Array<object>} apiResponseArray 
     * @param {string} concatKey 
     * @returns {Array<object>|null} Empty array might be returned if attemped to concat arrays that are not of res.query[concatKey]
     */
    concatQueryResponse: function(apiResponseArray, concatKey) {

        // Error handling
        if (!Array.isArray(apiResponseArray)) {
            console.error('TypeError: Array must be passed to the first argument of concatQueryResponse().');
            return null;
        }
        if (typeof concatKey !== 'string') {
            console.error('TypeError: String must be passed to the second argument of concatQueryResponse().');
            return null;
        }

        // Return a reduced array
        return apiResponseArray
            // Deep copy
            .slice()
            // Targets of concat must be located in res.query[concatKey]
            .filter(function(obj) {
                if (typeof obj.query[concatKey] !== 'undefined' && !Array.isArray(obj.query[concatKey])) {
                    console.warn('concatQueryResponse: Detected a non-array in res.query.' + concatKey + '.');
                }
                return obj && obj.query && Array.isArray(obj.query[concatKey]) && obj.query[concatKey].length !== 0;
            })
            // Create an array of the res.query[concatKey] arrays
            .map(function(obj) {
                return obj.query[concatKey];
            })
            // Reduce the array of arrays to an array of objects
            .reduce(function(acc, arr) {
                return acc.concat(arr);
            }, []);

    },

    
    /**
     * Parse templates in wikitext. Templates within tags that prevent transclusions (i.e. \<!-- -->, nowiki, pre, syntaxhighlist, source) are not parsed.
     * @param {string} wikitext 
     * @param {object} [config]
     * @param {boolean} [config.recursive] Whether to look for nested templates recursively. True by default.
     * @param {function(TemplateName): boolean} [config.namePredicate] Callback to filter out the result by name
     * @param {function(Template): boolean} [config.templatePredicate] Callback to filter out the result by user-defined conditions
     * @param {number} [nestlevel] Used internally. Don't specify this parameter manually.
     * @return {Array<Template>}
     * @typedef TemplateName
     * @type {string}
     * @typedef Template
     * @type {object}
     * @property {string} text The whole text of the template
     * @property {TemplateName} name The name of the template. The first letter is always in upper case.
     * @property {Array<TemplateArgument>} arguments The arguments of the template
     * @property {number} nestlevel The nestlevel of the template (0 if not embedded in other templates)
     * @typedef TemplateArgument
     * @type {object}
     * @property {string} text The whole text of the template argument (e.g. 1=Wikipedian)
     * @property {string} name The name of the template argument (e.g. 1)
     * @property {string} value The value of the template argument (e.g. Wikipedian)
     * @license siddharthvp@github - This function includes modifications from the original.
     * @link https://github.com/siddharthvp/mwn/blob/ccc6fb8/src/wikitext.ts#L77
     * @license Dr4goniez@github - This function includes modifications from the original.
     * @link https://github.com/Dr4goniez/dragobot/blob/740811cfecc24264b324085c8490ae63ef1ea1ea/src/lib.ts#L453
     */
    parseTemplates: function(wikitext, config, nestlevel) {

        nestlevel = typeof nestlevel === 'undefined' ? 0 : nestlevel;
        var self = this;

        // Initialize config
        config = this.merge({
            recursive: true,
            namePredicate: null,
            templatePredicate: null
        }, config || {});

        // Number of unclosed braces
        var numUnclosed = 0;

        // Are we in a {{{parameter}}}, or between wikitags that prevent transclusions?
        var inParameter = false;
        var inTag = false;
        var tagNames = [];

        var parsed = [];
        var slicedWkt, matchedTag, templateText, templateTextPipesBack;
        var startIdx, endIdx;

        // Look at every character of the wikitext one by one. This loop only extracts the outermost templates.
        for (var i = 0; i < wikitext.length; i++) {
            slicedWkt = wikitext.slice(i);
            if (!inParameter && !inTag) {
                if (/^\{\{\{(?!\{)/.test(slicedWkt)) {
                    inParameter = true;
                    i += 2;
                } else if (/^\{\{/.test(slicedWkt)) {
                    if (numUnclosed === 0) {
                        startIdx = i;
                    }
                    numUnclosed += 2;
                    i++;
                } else if (/^\}\}/.test(slicedWkt)) {
                    if (numUnclosed === 2) {
                        endIdx = i + 2;
                        templateText = wikitext.slice(startIdx, endIdx); // Pipes could have been replaced with a control character if they're part of nested templates
                        templateTextPipesBack = this._replacePipesBack(templateText);
                        parsed.push({
                            text: templateTextPipesBack,
                            name: this._capitalizeFirstLetter(templateTextPipesBack.replace(/^\{\{/, '').split(/\||\}/)[0].trim()),
                            arguments: this._parseTemplateArguments(templateText),
                            nestlevel: nestlevel
                        });
                    }
                    numUnclosed -= 2;
                    i++;
                } else if (wikitext[i] === '|' && numUnclosed > 2) { // numUnclosed > 2 means we're in a nested template
                    // Swap out pipes with \x01 character.
                    wikitext = this.strReplaceAt(wikitext, i, '\x01');
                } else if ((matchedTag = slicedWkt.match(/^(?:<!--|<(nowiki|pre|syntaxhighlist|source) ?[^>]*?>)/))) {
                    inTag = true;
                    tagNames.push(matchedTag[1] ? matchedTag[1] : 'comment');
                    i += matchedTag[0].length - 1;
                }
            } else {
                // we are in a {{{parameter}}} or tag 
                if (wikitext[i] === '|' && numUnclosed > 2) {
                    wikitext = this.strReplaceAt(wikitext, i, '\x01');
                } else if ((matchedTag = slicedWkt.match(/^(?:-->|<\/(nowiki|pre|syntaxhighlist|source) ?[^>]*?>)/))) {
                    inTag = false;
                    tagNames.pop();
                    i += matchedTag[0].length - 1;
                } else if (/^\}\}\}/.test(slicedWkt)) {
                    inParameter = false;
                    i += 2;
                }
            }     
        }

        var subtemplates;
        if (config) {
            // Get nested templates?
            if (config.recursive) {
                subtemplates = parsed
                    .map(function(template) {
                        return template.text.slice(2, -2);
                    })
                    .filter(function(templateWikitext) {
                        return /\{\{[.\n]*\}\}/.test(templateWikitext);
                    })
                    .map(function(templateWikitext) {
                        // @ts-ignore
                        return self.parseTemplates(templateWikitext, config, nestlevel + 1);
                    })
                    .reduce(function(acc, TemplateArray) {
                        return acc.concat(TemplateArray);
                    }, []);
                parsed = parsed.concat(subtemplates);
            }
            // Filter the array by template name(s)?
            if (typeof config.namePredicate === 'function') {
                parsed = parsed.filter(function(Template) {
                    // @ts-ignore
                    return config.namePredicate(Template.name);
                });
            }
            // Filter the array by a user-defined condition?
            if (typeof config.templatePredicate === 'function') {
                parsed = parsed.filter(function(Template) {
                    // @ts-ignore
                    return config.templatePredicate(Template);
                });
            }
        }

        return parsed;

    },

    /**
     * Replace \x01 control characters back to pipes.
     * @private
     * @param {string} string 
     * @returns {string}
     */
    _replacePipesBack: function(string) {
        // eslint-disable-next-line no-control-regex
        return string.replace(/\x01/g, '|');
    },

    /**
     * Capitalize the first letter of a string.
     * @private
     * @param {string} string 
     * @returns {string}
     */
    _capitalizeFirstLetter: function(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    },

    /**
     * This function should never be called externally because it presupposes that pipes in nested templates have been replaced with
     * the control character '\x01', and otherwise it doesn't work as expeceted.
     * @private
     * @param {string} template The whole text of a template. If it nests some other templates, pipes in them need to have been replaced with
     * the control character '\x01'.
     * @returns {Array<TemplateArgument>}
     */
    _parseTemplateArguments: function(template) {

        if (template.indexOf('|') === -1) return [];
        
        var innerContent = template.slice(2, -2); // Remove braces

        // Swap out pipes in links with \x01 control character
        // [[File: ]] can have multiple pipes, so might need multiple passes
        var wikilinkRegex = /(\[\[[^\]]*?)\|(.*?\]\])/g;
        while (wikilinkRegex.test(innerContent)) {
            innerContent = innerContent.replace(wikilinkRegex, '$1\x01$2');
        }

        var args = innerContent.split('|');
        args.shift(); // Remove template name
        var unnamedArgCount = 0;

        var self = this;
        var parsedArgs = args.map(function(arg) {

            // Replace {{=}}s with a (unique) control character
            // The magic words could have spaces before/after the equal sign in an inconsistent way
            // We need the input string back as it was before replacement, so mandane replaceAll isn't a solution here 
            var magicWordEquals = arg.match(/\{\{\s*=\s*\}\}/g) || [];
            magicWordEquals.forEach(function(equal, i) {
                arg = arg.replace(equal, '$EQ' + i);
            });

            var argName, argValue;
            var indexOfEqual = arg.indexOf('=');
            if (indexOfEqual >= 0) { // The argument is named
                argName = arg.slice(0, indexOfEqual).trim();
                argValue = arg.slice(indexOfEqual + 1).trim();
                if (argName === unnamedArgCount.toString()) unnamedArgCount++;
            } else { // The argument is unnamed
                argName = (++unnamedArgCount).toString();
                argValue = arg.trim();
            }

            // Get the replaced {{=}}s back
            magicWordEquals.forEach(function(equal, i) {
                var replacee = '$EQ' + i;
                arg = arg.replace(replacee, equal);
                argName = argName.replace(replacee, equal);
                argValue = argValue.replace(replacee, equal);
            });

            return {
                text: self._replacePipesBack(arg),
                name: self._replacePipesBack(argName),
                value: self._replacePipesBack(argValue)
            };

        });

        return parsedArgs;

    },

    /**
     * Replace the n-th character in a string with a certain character.
     * @param {string} string 
     * @param {number} index 
     * @param {string} char 
     * @returns {string}
     */
    strReplaceAt: function(string, index, char) {
        return string.slice(0, index) + char + string.slice(index + 1);
    },

    /**
     * Parse an HTML string and get the outerHTML of each tag in it.
     * @param {string} html 
     * @param {object} [config]
     * @param {function(TagName): boolean} [config.namePredicate] Callback to filter out the result by tag name. \<!-- --> tags are named as 'comment'.
     * @param {function(Html): boolean} [config.htmlPredicate] Callback to filter out the result by user-defined conditions
     * @returns {Array<Html>}
     * @typedef TagName
     * @type {string}
     * @typedef Html
     * @type {object}
     * @property {string} text OuterHTML of the tag.
     * @property {TagName} name Name of the tag in lower case.
     * @property {number} nestlevel Nest level of the tag. If it's not part of another tag, the value is 0.
     * @property {boolean} selfclosing Whether the tag is closed by itself.
     * @property {{start: number, end: number}} index Indexes of the html tag in the input string. The end index is 'characters up to or not
     * including', so the relevant tag can be extracted from the input string by "input.slice(index.start, index.end)".
     */
    parseHtml: function(html, config) {

        // Initialize config
        config = this.merge({
            recursive: true,
            namePredicate: null,
            htmlPredicate: null
        }, config || {});
    
        // eslint-disable-next-line no-useless-escape
        var openingTagRegex = /^(?:<!--|<([a-z]+) ?[^\/>]*?>)/i;
        var closingTagRegex = /^(?:-->|<\/([a-z]+) ?[^>]*?>)/i;
        var selfclosingTagRegex = /^<([a-z]+) ?[^>]*?\/>/i;

        var matched;
        var parsed = [];
        /**
         * @type {Array<{name: string, startIdx: number, selfClosingIdx: number}>}
         */
        var tags = []; // All elements are pushed into the beginning of the array in the loop below (unshift)

        for (var i = 0; i < html.length; i++) {
            var slicedHtml = html.slice(i);

            // For when the current index is the start of <tag /> (self-closing)
            if ((matched = slicedHtml.match(selfclosingTagRegex))) {

                parsed.push({
                    text: html.slice(i, i + matched[0].length),
                    name: matched[1].toLowerCase(),
                    nestlevel: NaN,
                    selfclosing: true,
                    index: {
                        start: i,
                        end: i + matched[0].length
                    }
                });
                i += matched[0].length - 1;

            // Not the start of a self-closing tag
            } else {

                // Not inside any other tags
                if (tags.length === 0) {

                    // Start of a new tag
                    if ((matched = slicedHtml.match(openingTagRegex))) {

                        // Save the current index and the tag name
                        tags.unshift({
                            name: matched[1] ? matched[1].toLowerCase() : 'comment',
                            startIdx: i,
                            selfClosingIdx: i + matched[0].length
                        });
                        i += matched[0].length - 1; // Continue the loop after the end of the matched tag

                    // End of a tag (ungrammatical)
                    } else if ((matched = slicedHtml.match(closingTagRegex))) {
                        i += matched[0].length - 1; // Just skip
                    }

                // Inside some other tags
                } else {

                    // Start of a new tag (nested tag); same as when not nested
                    if ((matched = slicedHtml.match(openingTagRegex))) {

                        tags.unshift({
                            name: matched[1] ? matched[1].toLowerCase() : 'comment',
                            startIdx: i,
                            selfClosingIdx: i + matched[0].length
                        });
                        i += matched[0].length - 1;

                    // End of a tag
                    } else if ((matched = slicedHtml.match(closingTagRegex))) {

                        var endIdx = i + matched[0].length;
                        var tagName = matched[1] ? matched[1].toLowerCase() : 'comment';
                        var deleteIdx;

                        // Asssume that the html has the structure of '<p> ... <br> ... </p>' in the comments below
                        tags.some(function(obj, j) {
                            if (obj.name === tagName) { // There's a <p> for the </p>; just need to find the start index of the <p>
                                parsed.push({
                                    text: html.slice(obj.startIdx, endIdx),
                                    name: obj.name,
                                    nestlevel: NaN,
                                    selfclosing: false,
                                    index: {
                                        start: obj.startIdx,
                                        end: endIdx
                                    }
                                });
                                deleteIdx = j + 1;
                                return true;
                            } else { // There's a <br> for the </p>; <br> closes itself, neccesary to retrieve the start and end indexes from the saved tag object
                                parsed.push({
                                    text: html.slice(obj.startIdx, obj.selfClosingIdx),
                                    name: obj.name,
                                    nestlevel: NaN,
                                    selfclosing: true,
                                    index: {
                                        start: obj.startIdx,
                                        end: obj.selfClosingIdx
                                    }
                                });
                                return false;
                            }
                        });
                        tags.splice(0, deleteIdx); // Remove pushed tags, e.g. [br, p, span, p, ...] => [span, p, ...]

                    }

                }
            }
        }

        // Deal with elements that are still in the tags array (self-closing ones)
        // E.g. '<br> ... <br> (... <p></p>)'; <br>s are still in the array because they don't have corresponding closing tags
        tags.forEach(function(obj) {
            parsed.push({
                text: html.slice(obj.startIdx, obj.selfClosingIdx),
                name: obj.name,
                nestlevel: NaN,
                selfclosing: true,
                index: {
                    start: obj.startIdx,
                    end: obj.selfClosingIdx
                }
            });
        });

        // Sort the result by start index and set nestlevel
        parsed = parsed.sort(function(obj1, obj2) {
            return obj1.index.start - obj2.index.start;
        });
        // @ts-ignore
        parsed.forEach(function(obj, i, arr) {
            // If the relevant indexes are e.g. '0 ... [1 ... 59] ... 60', the nestlevel is 1
            var nestlevel = arr.filter(function(objF) { return objF.index.start < obj.index.start && obj.index.end < objF.index.end; }).length;
            obj.nestlevel = nestlevel;
        });

        // Filter the result by config
        if (config) {
            // Filter the array by tag name(s)?
            if (typeof config.namePredicate === 'function') {
                parsed = parsed.filter(function(Html) {
                    // @ts-ignore
                    return config.namePredicate(Html.name);
                });
            }
            // Filter the array by a user-defined condition?
            if (typeof config.htmlPredicate === 'function') {
                parsed = parsed.filter(function(Html) {
                    // @ts-ignore
                    return config.htmlPredicate(Html);
                });
            }
        }

        return parsed;
    
    },

    /**
     * Get strings enclosed by \<!-- -->, \<nowiki />, \<pre />, \<syntaxhighlight />, and \<source />, not including those nested
     * inside other occurrences of these tags.
     * @param {string} wikitext 
     * @returns {string[]}
     */
    getCommentTags: function(wikitext) {
        var namePredicate = function(name) {
            return ['comment', 'nowiki', 'pre', 'syntaxhighlight', 'source'].indexOf(name) !== -1;
        };
        var commentTags = this.parseHtml(wikitext, {namePredicate: namePredicate})
            // @ts-ignore
            .filter(function(Html, i, arr) {
                // Get rid of comment tags that are nested inside bigger comment tags
                return !arr.some(function(Html2) {return Html2.index.start < Html.index.start && Html.index.end < Html2.index.end; });
            })
            .map(function(Html) {
                return Html.text;
            });
        return commentTags;
    },
        
    /**
     * Replace strings by given strings in a wikitext, ignoring replacees in tags that prevent transclusions (i.e. \<!-- -->, nowiki, pre, syntaxhighlist, source).
     * The replacees array and the replacers array must have the same number of elements in them. This restriction does not apply only if the replacees are to be 
     * replaced with one unique replacer, and the 'replacers' argument is a string or an array containing only one element.  
     * @param {string} wikitext 
     * @param {Array<string|RegExp>} replacees 
     * @param {string|Array<string>} replacers 
     * @returns {string|null}
     */
    replaceWikitext: function(wikitext, replacees, replacers) {
    
        var replacersArr = [];
        if (typeof replacers === 'string') {
            replacersArr.push(replacers);
        } else {
            replacersArr = replacers.slice(); // Deep copy
        }
        if (replacees.length !== replacersArr.length && replacersArr.length === 1) {
            // @ts-ignore
            replacees.forEach(function(el, i) {
                if (i === 0) return;
                replacersArr.push(replacersArr[0]);
            });
        }
        if (replacees.length !== replacersArr.length) {
            console.error('replaceWikitext: replacees and replacers must have the same number of elements in them.');
            return null;
        }
    
        // Extract transclusion-preventing tags in the wikitext
        var commentTags = this.getCommentTags(wikitext);
    
        // Temporarily replace comment tags with a (unique) control character
        commentTags.forEach(function(tag, i) {
            wikitext = wikitext.replace(tag, '$CO' + i);
        });
    
        // Replace all
        for (var i = 0; i < replacees.length; i++) {
            wikitext = wikitext.split(replacees[i]).join(replacersArr[i]);
        }
    
        // Get the comment tags back
        commentTags.forEach(function(tag, i) {
            wikitext = wikitext.replace('$CO' + i, tag);
        });
    
        return wikitext;
    
    },

    // ============================================== ASYNCHRONOUS METHODS ==============================================

    /**
     * Send an AJAX request to the API.
     * @param {object} parameters Parameters to the API
     * @param {object} [ajaxOptions] Parameters to pass to jQuery.ajax
     * @returns {jQuery<Promise>}
     * @license MediaWiki This function is largely adapted from MediaWiki Core.
     * @link https://doc.wikimedia.org/mediawiki-core/master/js/source/index4.html#mw-Api-method-ajax
     */
    ajax: function(parameters, ajaxOptions) {
        // @ts-ignore
        var def = $.Deferred();

        parameters = this.merge({}, this.defaultOptions.parameters, parameters || {});
        ajaxOptions = this.merge({}, this.defaultOptions.ajax, ajaxOptions || {});
        ajaxOptions.data = parameters;

        // Make the AJAX request
        $.ajax(ajaxOptions)
        // If AJAX fails, reject API call with error code 'http' and details in second argument.
        .fail(function(jqXHR, textStatus, exception) {
            def.reject('http', {
                xhr: jqXHR,
                textStatus: textStatus,
                exception: exception
            });
        })
        // AJAX success just means "200 OK" response, also check API error codes
        // @ts-ignore
        .done(function(result, textStatus, jqXHR) {
            var code;
            if (result === undefined || result === null || result === '') {
                def.reject('ok-but-empty',
                    'OK response but empty result (check HTTP headers?)',
                    result,
                    jqXHR
                );
            } else if (result.error) {
                // errorformat=bc
                code = result.error.code === undefined ? 'unknown' : result.error.code;
                def.reject(code, result, result, jqXHR);
            } else if (result.errors) {
                // errorformat!=bc
                code = result.errors[0].code === undefined ? 'unknown' : result.errors[0].code;
                def.reject(code, result, result, jqXHR);
            } else {
                def.resolve(result, jqXHR);
            }
        });

        // @ts-ignore
        return def.promise();
    },

    /**
     * Perform API get request.
     * @param {Object} parameters
     * @param {Object} [ajaxOptions]
     * @return {jQuery<Promise>}
     */
    get: function(parameters, ajaxOptions) {
        ajaxOptions = ajaxOptions || {};
        ajaxOptions.type = 'GET';
        return this.ajax(parameters, ajaxOptions);
    },

    /**
     * Perform API post request.
     * @param {Object} parameters
     * @param {Object} [ajaxOptions]
     * @return {jQuery<Promise>}
     */
    post: function(parameters, ajaxOptions) {
        ajaxOptions = ajaxOptions || {};
        ajaxOptions.type = 'POST';
        return this.ajax(parameters, ajaxOptions);
    },

    /**
     * Get the latest revision of a given page. This function never rejects.
     * @param {string} pagename 
     * @param {object} ajaxOptions 
     * @returns {ReadResponse|false|undefined} False if the page doesn't exist, undefined if an error occurs, or else an object
     * @typedef ReadResponse
     * @type {object}
     * @property {boolean} isRedirect
     * @property {string} basetimestamp
     * @property {string} curtimestamp
     * @property {string} content
     * @property {string} revid
     */
    read: function(pagename, ajaxOptions) {
        var def = $.Deferred();

        var params = {
            titles: pagename,
            prop: 'info|revisions',
            rvprop: 'ids|timestamp|content',
            rvslots: 'main',
            curtimestamp: true
        };

        this.get(params, ajaxOptions)
            // @ts-ignore
            .then(function(res) {

                var resPgs;
                if (!res || !res.query || !(resPgs = res.query.pages) || !Array.isArray(resPgs) || resPgs.length === 0) {
                    console.warn('read() received an invalid response from the API.');
                    return def.resolve();
                }

                resPgs = resPgs[0];
                if (resPgs.missing) return def.resolve(false);

                if (!resPgs.revisions) {
                    console.warn('read() received an invalid response from the API.');
                    return def.resolve();
                }

                var resRev = resPgs.revisions[0];
                def.resolve({
                    isRedirect: resPgs.redirect ? true : false,
                    basetimestamp: resRev.timestamp,
                    curtimestamp: res.curtimestamp,
                    content: resRev.slots.main.content,
                    revid: resRev.revid.toString()
                });

            // @ts-ignore
            }).catch(function(code, err) {
                console.warn(err.error.info);
                def.resolve();
            });

        // @ts-ignore
        return def.promise();
    },

    /**
     * Send API request that automatically continues until the limit is reached. Works only for calls that have a 'continue' property in the response.
     * The '**limit' property in the 'parameters' should always be set to 'max'.
     * @param {object} parameters
     * @param {number} [limit] 10 by default 
     * @returns {jQuery<Promise<Array<object>>>} Array of API responses.
     * @link https://github.com/Dr4goniez/dragobot/blob/740811cfecc24264b324085c8490ae63ef1ea1ea/src/lib.ts#L324
     */
    continuedQuery: function(parameters, limit) {

        if (typeof limit === 'undefined') limit = 10;
        var responses = [];

        var self = this;
        var query = function(params, count) {
            return self.get(params)
            // @ts-ignore
            .then(function(res) {
                responses.push(res);
                // @ts-ignore
                if (res.continue && count < limit) {
                    return query(self.merge(params, res.continue), count + 1);
                } else {
                    return responses;
                }
            // @ts-ignore
            }).catch(function(code, err) {
                console.warn('continuedQuery: Query failed (reason: ' + err.error.info + ', loop count: ' + count + ').');
                return responses;
            });
        };
    
        return query(parameters, 1);
    
    },

    /**
     * Send API requests involving a multi-value field all at once. The multi-value field needs to be an array, which is internally converted to a
     * pipe-separated string by splicing the array by 500 (or 50 for users without apihighlimits). The name(s) of the multi-value field(s) must also
     * be provided. If the splicing number needs to be configured, pass the relevant number to the third argument.
     * @param {object} params 
     * @param {string|Array<string>} batchParam The name of the multi-value field (can be an array if there are more than one multi-value field, but
     * the  values must be the same.)
     * @param {number} [batchLimit] Optional splicing number (default: 500/50). The '**limit' property of the params is automatically set to 'max' if
     * this argument has the value of either 500 or 50, which means that 'max' is selected when no value is passed to this argument, but the parameter
     * is not modified if a unique value is specified for this argument.
     * @returns {jQuery<Promise<Array<object|undefined>>>} Always an array; Elements are either ApiResponse (success) or undefined (failure). If the
     * batchParam is an empty array, Promise<[]> (empty array) is returned.
     * @license Dr4goniez@github
     * @link https://github.com/Dr4goniez/dragobot/blob/740811cfecc24264b324085c8490ae63ef1ea1ea/src/lib.ts#L360
     */
    massQuery: function(params, batchParam, batchLimit) {
        var def = $.Deferred();

        var limit = batchLimit || this.apiHighLimits ? 500 : 50;

        // Get the array to be used for the batch operation
        var batchArray, sameArrayProvided, fieldNames;
        var self = this;
        if (Array.isArray(batchParam)) {
            sameArrayProvided = Object.keys(params)
                .filter(function(key) {
                    return batchParam.indexOf(key) !== -1;
                })
                .map(function(key) {
                    return params[key]; // Get multi-value fields as an array
                })
                // @ts-ignore
                .every(function(multiValueFieldArray, i, arr) {
                    return Array.isArray(multiValueFieldArray) && arr.every(function(allMultiValueFieldArray) {
                        self.arraysEqual(multiValueFieldArray, allMultiValueFieldArray);
                    });
                });
            if (!sameArrayProvided) {
                console.error('massQuery: Batch fields have different arrays.');
                // @ts-ignore
                return def.reject();
            }
            batchArray = params[batchParam[0]];
        } else {
            batchArray = params[batchParam];
            if (!Array.isArray(batchArray)) {
                console.error('massQuery: Batch field in query must be an array.');
                // @ts-ignore
                return def.reject();
            }
        }
        if (batchArray.length === 0) {
            fieldNames = Array.isArray(batchParam) ? batchParam.join(', ') : batchParam;
            console.warn('massQuery: Batch field is an empty array (' + fieldNames + ').');
            // @ts-ignore
            return def.resolve([]);
        }
        batchArray = batchArray.slice(); // Deep copy

        // Set the '**limit' parameter as 'max' if there's any
        var limitKey = Object.keys(params)
            .filter(function(key) {
                return /limit$/.test(key);
            });
        if (limitKey.length !== 0 && !batchLimit) params[limitKey[0]] = 'max';

        // Send API requests
        var result = [];
        var splicedBatchArrayPiped;
        while (batchArray.length !== 0) {

            splicedBatchArrayPiped = batchArray.splice(0, limit).join('|');
            if (typeof batchParam === 'string') {
                params[batchParam] = splicedBatchArrayPiped;
            } else {
                Object.keys(params).forEach(function(key) {
                    if (batchParam.indexOf(key) !== -1) params[key] = splicedBatchArrayPiped;
                });
            }

            result.push(
                this.post(params)
                // @ts-ignore
                .then(function(res){
                    return res;
                })
                // @ts-ignore
                .catch(function(code, err) {
                    console.warn(err.error.info);
                })
            );

        }
        
        $.when.apply($, result)
            .then(function() {
                var args = arguments;
                var resultArray = Object.keys(args).map(function(key) {
                    return args[key];
                });
                def.resolve(resultArray);
            });

        // @ts-ignore
        return def.promise();
    },

    /**
     * Get bullet-points-notated interface in the MediaWiki namespace as an array of objects.
     * @param {string} interfaceName block/delete/protect
     * @param {boolean} [createOptionTags] If true, return a string of \<option>s for \<select>
     * @returns {jQuery<Promise<string|Array<{index: number, caption: string}>>>}
     */
    getInterface: function(interfaceName, createOptionTags) {
        var def = $.Deferred();

        var pagetitle = 'MediaWiki:';
        switch (interfaceName) {
            case 'block':
                pagetitle += 'Ipbreason-dropdown';
                break;
            case 'delete':
                pagetitle += 'Deletereason-dropdown';
                break;
            case 'protect':
                pagetitle += 'Protect-dropdown';
                break;
            default:
                console.error('getInterface() only accepts "block", "delete", or "protect" as the first argument.');
                // @ts-ignore
                return def.reject();
        }

        this.get({
            titles: pagetitle,
            prop: 'revisions',
            rvprop: 'content'
        // @ts-ignore
        }).then(function(res) {
    
            var resPages;
            if (!res || !res.query || !(resPages = res.query.pages) || resPages.length === 0) {
                console.warn('getInterface() received an invalid response from the API.');
                return def.reject();
            }

            var content = resPages[0].revisions[0].content;
            var reasonRegex = /(\*+)[^\S\r\n]*([^\n]+)\n?/g;
            var rawReasons = [];
            var matched;
            while ((matched = reasonRegex.exec(content))) {
                rawReasons.push(matched);
            }
            if (rawReasons.length === 0) {
                console.warn('getInterface() coudn\'t fetch anything out of the interface.');
                return def.resolve();
            }

            var reasons = rawReasons.map(function(matchArray) {
                return {
                    index: matchArray[1].length,
                    caption: matchArray[2]
                };
            });

            if (!createOptionTags) return def.resolve(reasons);

            var optionTags = '';
            var lastIndex = 1;
            reasons.forEach(function(obj, i, arr) {
                if (obj.index === 1) {
                    if (lastIndex > obj.index) {
                        optionTags += '</optgroup>';
                    }
                    optionTags += '<optgroup label=' + obj.caption + '>';
                } else {
                    optionTags += '<option>' + obj.caption + '</option>';
                }
                if (i === arr.length - 1) optionTags += '</optgroup>';
                lastIndex = obj.index;
            });
            def.resolve(optionTags);
    
        // @ts-ignore
        }).catch(function(code, err) {
            console.error(err.error.info);
            def.reject();
        });

        // @ts-ignore
        return def.promise();
    },

    /**
     * Get a list of VIPs.
     * @param {boolean} [wikiLinkFormat] If true, format the response as '[[WP:VIP#****]]'
     * @returns {jQuery<Promise<Array<string>>>} Array of '****', where the stars are filtered section titles on [[WP:VIP]].
     */
    getVipList: function(wikiLinkFormat) {
        return this.get({
            action: 'parse',
            page: 'Wikipedia:進行中の荒らし行為',
            prop: 'sections'
        // @ts-ignore
        }).then(function(res) {

            var resSect;
            if (!res || !res.parse || !Array.isArray(resSect = res.parse.sections) || resSect.length === 0) {
                console.warn('getVipList() received an invalid response from the API.');
                return [];
            }

            // Section titles that have nothing to do with VIPs
            var excludeList = [
                '記述について',
                '急を要する二段階',
                '配列',
                'ブロック等の手段',
                'このページに利用者名を加える',
                '注意と選択',
                '警告の方法',
                '未登録（匿名・IP）ユーザーの場合',
                '登録済み（ログイン）ユーザーの場合',
                '警告中',
                '関連項目'
            ];

            var viplist = resSect
                .filter(function(obj) {
                    return excludeList.indexOf(obj.line) === -1 && obj.level == 3;
                }).map(function(obj) {
                    return wikiLinkFormat ? '[[WP:VIP#' + obj.line + ']]' : obj.line;
                });

            return viplist;

        // @ts-ignore
        }).catch(function(code, err) {
            console.warn('Query failed for getVipList: ' + err.errror.info);
            return [];
        });
    },

    /**
     * Get a list of LTAs.
     * @param {boolean} [wikiLinkFormat] If true, format the response as '[[LTA:****]]'
     * @returns {jQuery<Promise<Array<string>>>} Array of 'LTA:****'
     */
    getLtaList: function(wikiLinkFormat) {
        return this.continuedQuery({
            list: 'allpages',
            apprefix: 'LTA:',
            apnamespace: '0',
            apfilterredir: 'redirects',
            aplimit: '200'
        // @ts-ignore
        }).then(function(res) {
            return res
                .filter(function(obj) {
                    return obj && obj.query && obj.query.allpages && obj.query.allpages.length !== 0;
                })
                .map(function(obj) {
                    return obj.query.allpages;
                })
                .reduce(function(acc, arr) {
                    return acc.concat(arr);
                }, [])
                .filter(function(obj) {
                    return obj && obj.title && !/^LTA:$|\/.+$/.test(obj.title);
                })
                .map(function(obj) {
                    return wikiLinkFormat ? '[[' + obj.title + ']]' : obj.title;
                });
        });
    }

};

// For when this library is used as a module of a gadget
try {
    module.exports = WPLib;
}
// eslint-disable-next-line no-empty
catch(err) {}

// =================================================================================================================
//</nowiki>